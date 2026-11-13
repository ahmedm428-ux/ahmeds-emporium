// App State
let isAdmin = false;
let isMod = false;
let currentUser = null;
let currentProfile = null;
let allUsersCache = [];
let blockedUserIds = new Set();
let staffUserIds = new Set();

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  checkInitialSession();
});

// Setup Event Listeners
function setupEventListeners() {
  document.getElementById("btn-email-signup")?.addEventListener("click", () => {
    signUpWithEmail(document.getElementById("auth-email").value, document.getElementById("auth-password").value);
  });

  document.getElementById("btn-email-signin")?.addEventListener("click", () => {
    signInWithEmail(document.getElementById("auth-email").value, document.getElementById("auth-password").value);
  });

  document.getElementById("btn-github-auth")?.addEventListener("click", signInWithGitHub);

  document.getElementById("btn-signout")?.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    location.reload();
  });

  document.getElementById("btn-save-username")?.addEventListener("click", handleSaveUsername);

  document.getElementById("recipe-form")?.addEventListener("submit", handleRecipeSubmit);

  // Admin Promote Moderator Handler
  document.getElementById("btn-add-mod")?.addEventListener("click", async () => {
    const modId = document.getElementById("mod-user-id").value.trim();
    if (!modId) return alert("Enter a User ID.");
    
    const { error } = await supabaseClient.from('moderators').insert([{ user_id: modId }]);
    if (error) alert("Error adding moderator: " + error.message);
    else {
      alert("Moderator added successfully!");
      document.getElementById("mod-user-id").value = "";
      fetchAllUsersForStaff();
    }
  });

  // Live User Search Input in Staff Sidebar
  document.getElementById("user-search-input")?.addEventListener("input", (e) => {
    renderStaffUserList(e.target.value.trim().toLowerCase());
  });
}

// Session Checks
async function checkInitialSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    await handleUserSignedIn(session.user);
  } else {
    showAuthSection();
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      await handleUserSignedIn(session.user);
    } else if (event === 'SIGNED_OUT') {
      showAuthSection();
    }
  });
}

// User Sign-in Logic & Role Resolution
async function handleUserSignedIn(user) {
  currentUser = user;

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    showUsernameSetup();
    return;
  }

  currentProfile = profile;

  // Query role tables concurrently
  const [{ data: adminData }, { data: modData }] = await Promise.all([
    supabaseClient.from('admins').select('*').eq('user_id', user.id).maybeSingle(),
    supabaseClient.from('moderators').select('*').eq('user_id', user.id).maybeSingle()
  ]);

  isAdmin = !!adminData;
  isMod = !!modData || isAdmin;

  showVaultContent();
}

// Authentication Handlers
async function signUpWithEmail(email, password) {
  if (!email || !password) return alert("Please fill in all fields.");
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) alert("Sign up error: " + error.message);
  else alert("Sign up successful! Please log in.");
}

async function signInWithEmail(email, password) {
  if (!email || !password) return alert("Please fill in all fields.");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) alert("Sign in error: " + error.message);
}

async function signInWithGitHub() {
  const targetUrl = 'https://ahmedm428-ux.github.io/ahmeds-emporium/identity%20app/';

  if (window.top !== window.self) {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: targetUrl,
        skipBrowserRedirect: true
      }
    });
    if (data?.url) {
      window.top.location.href = data.url;
    }
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: targetUrl
    }
  });
  if (error) alert("GitHub auth error: " + error.message);
}

// Profile Handling
async function handleSaveUsername() {
  const username = document.getElementById("username-input").value.trim();
  if (!username) return alert("Username required.");

  const { error } = await supabaseClient
    .from('profiles')
    .insert([{ id: currentUser.id, username }]);

  if (error) {
    alert("Error saving profile: " + error.message);
  } else {
    handleUserSignedIn(currentUser);
  }
}

// Recipe Management & Media Upload
async function handleRecipeSubmit(e) {
  e.preventDefault();
  const title = document.getElementById("recipe-title").value.trim();
  const ingredients = document.getElementById("recipe-ingredients").value.trim();
  const instructions = document.getElementById("recipe-instructions").value.trim();
  const fileInput = document.getElementById("recipe-file");
  const file = fileInput?.files[0];

  let mediaUrl = null;
  let fileType = null;

  if (file) {
    const fileExt = file.name.split('.').pop();
    const filePath = `${currentUser.id}/${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabaseClient.storage
      .from('recipe-media')
      .upload(filePath, file);

    if (uploadError) {
      return alert("Error uploading file: " + uploadError.message);
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from('recipe-media')
      .getPublicUrl(filePath);

    mediaUrl = publicUrlData.publicUrl;
    fileType = file.type.includes('pdf') ? 'pdf' : 'image';
  }

  const { error } = await supabaseClient.from('recipes').insert([{
    title,
    ingredients,
    instructions,
    media_url: mediaUrl,
    file_type: fileType,
    user_id: currentUser.id,
    is_hidden: false
  }]);

  if (error) {
    alert("Error adding recipe: " + error.message);
  } else {
    document.getElementById("recipe-form").reset();
    fetchVaultRecipes();
  }
}

async function fetchVaultRecipes() {
  // 1. Fetch recipes, current user's blocked list, and staff IDs concurrently
  const [
    { data: recipes, error },
    { data: blocks },
    { data: admins },
    { data: mods }
  ] = await Promise.all([
    supabaseClient.from('recipes').select('*, profiles(username)').order('created_at', { ascending: false }),
    currentUser ? supabaseClient.from('blocked_users').select('blocked_id').eq('blocker_id', currentUser.id) : { data: [] },
    supabaseClient.from('admins').select('user_id'),
    supabaseClient.from('moderators').select('user_id')
  ]);

  if (error) return console.error("Error fetching recipes:", error);

  blockedUserIds = new Set((blocks || []).map(b => b.blocked_id));
  staffUserIds = new Set([
    ...(admins || []).map(a => a.user_id),
    ...(mods || []).map(m => m.user_id)
  ]);

  const container = document.getElementById("recipe-list");
  
  // Regular users cannot see staff-hidden posts (unless it's their own); Staff can see all posts
  const visibleRecipes = recipes.filter(r => !r.is_hidden || isMod || (currentUser && r.user_id === currentUser.id));

  if (!visibleRecipes || visibleRecipes.length === 0) {
    container.innerHTML = `<p class="text-xs text-gray-500">No recipes found yet.</p>`;
    return;
  }

  container.innerHTML = visibleRecipes.map(r => {
    const isAuthorSelf = currentUser && r.user_id === currentUser.id;
    const isAuthorStaff = staffUserIds.has(r.user_id);
    const isAuthorBlocked = blockedUserIds.has(r.user_id);

    let attachmentHtml = '';
    if (r.media_url) {
      if (r.file_type === 'pdf') {
        attachmentHtml = `<a href="${r.media_url}" target="_blank" class="inline-block mt-2 text-xs text-amber-500 underline font-semibold">📄 View Attached PDF</a>`;
      } else {
        attachmentHtml = `<img src="${r.media_url}" alt="${r.title}" class="mt-2 rounded border border-gray-800 max-h-48 w-full object-cover" />`;
      }
    }

    const canDelete = isAuthorSelf || isMod;

    // Block / Unblock Button (Only shown for other users who are NOT Mods or Admins)
    let blockBtnHtml = '';
    if (currentUser && !isAuthorSelf && !isAuthorStaff) {
      if (isAuthorBlocked) {
        blockBtnHtml = `<button type="button" onclick="unblockUser('${r.user_id}', '${r.profiles?.username || 'this user'}')" class="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-2 py-1 rounded transition">Unblock</button>`;
      } else {
        blockBtnHtml = `<button type="button" onclick="blockUser('${r.user_id}', '${r.profiles?.username || 'this user'}')" class="text-xs bg-gray-800 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-gray-700 px-2 py-1 rounded transition">Block</button>`;
      }
    }

    // Staff Hide/Unhide Button
    const hideBtnHtml = isMod
      ? `<button type="button" onclick="toggleHideRecipe('${r.id}', ${!r.is_hidden})" class="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded transition">${r.is_hidden ? 'Unhide' : 'Hide'}</button>`
      : '';

    const deleteBtnHtml = canDelete
      ? `<button type="button" onclick="deleteRecipe('${r.id}', '${r.media_url || ''}')" class="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded transition">Delete</button>`
      : '';

    const hiddenBadge = r.is_hidden
      ? `<span class="inline-block bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Hidden from public</span>`
      : '';

    // Blocked Post Placeholder Banner
    const blockedBannerHtml = isAuthorBlocked ? `
      <div id="blocked-placeholder-${r.id}" class="flex flex-col items-center justify-center text-center py-6 px-4 space-y-3">
        <p class="text-xs text-gray-400">🚫 You have blocked this user's post.</p>
        <div class="flex items-center space-x-2">
          <button type="button" onclick="revealBlockedPost('${r.id}')" class="text-xs bg-gray-800 hover:bg-gray-700 text-amber-500 border border-gray-700 px-3 py-1.5 rounded font-medium transition">
            Click here to see their post
          </button>
          <button type="button" onclick="unblockUser('${r.user_id}', '${r.profiles?.username || 'this user'}')" class="text-xs text-gray-500 hover:text-gray-300 underline px-2 py-1">
            Unblock user
          </button>
        </div>
      </div>
    ` : '';

    // Actual Recipe Content (hidden initially if author is blocked)
    const recipeBodyHtml = `
      <div id="recipe-body-${r.id}" class="${isAuthorBlocked ? 'hidden' : ''} space-y-2">
        <div class="flex justify-between items-start gap-2">
          <div>
            ${hiddenBadge}
            <h3 class="font-bold text-amber-500">${r.title}</h3>
            <p class="text-xs text-gray-400">By ${r.profiles?.username || 'Anonymous'}</p>
          </div>
          <div class="flex items-center space-x-1.5 shrink-0">
            ${blockBtnHtml}
            ${hideBtnHtml}
            ${deleteBtnHtml}
          </div>
        </div>
        <div class="text-xs text-gray-300">
          <strong>Ingredients:</strong> <pre class="font-sans whitespace-pre-wrap text-gray-400">${r.ingredients}</pre>
        </div>
        <div class="text-xs text-gray-300">
          <strong>Instructions:</strong> <p class="text-gray-400">${r.instructions}</p>
        </div>
        ${attachmentHtml}
      </div>
    `;

    return `
      <div class="bg-gray-900 border ${r.is_hidden ? 'border-red-500/40 opacity-75' : 'border-gray-800'} p-4 rounded-xl">
        ${blockedBannerHtml}
        ${recipeBodyHtml}
      </div>
    `;
  }).join('');
}

function revealBlockedPost(recipeId) {
  document.getElementById(`blocked-placeholder-${recipeId}`)?.classList.add("hidden");
  document.getElementById(`recipe-body-${recipeId}`)?.classList.remove("hidden");
}

async function blockUser(targetUserId, username) {
  if (staffUserIds.has(targetUserId)) {
    return alert("You cannot block an Admin or Moderator.");
  }

  if (!confirm(`Are you sure you want to block ${username}? Their posts will be hidden unless you click to view them.`)) return;

  const { error } = await supabaseClient
    .from('blocked_users')
    .insert([{ blocker_id: currentUser.id, blocked_id: targetUserId }]);

  if (error) {
    alert("Error blocking user: " + error.message);
  } else {
    fetchVaultRecipes();
  }
}

async function unblockUser(targetUserId, username) {
  if (!confirm(`Unblock ${username}?`)) return;

  const { error } = await supabaseClient
    .from('blocked_users')
    .delete()
    .eq('blocker_id', currentUser.id)
    .eq('blocked_id', targetUserId);

  if (error) {
    alert("Error unblocking user: " + error.message);
  } else {
    fetchVaultRecipes();
  }
}

async function toggleHideRecipe(recipeId, hideState) {
  const actionText = hideState ? "hide" : "unhide";
  if (!confirm(`Are you sure you want to ${actionText} this post?`)) return;

  const { error } = await supabaseClient
    .from('recipes')
    .update({ is_hidden: hideState })
    .eq('id', recipeId);

  if (error) {
    alert(`Error updating post visibility: ` + error.message);
  } else {
    fetchVaultRecipes();
  }
}

async function deleteRecipe(recipeId, mediaUrl) {
  if (!confirm("Are you sure you want to delete this recipe? This action cannot be undone.")) return;

  if (mediaUrl && mediaUrl.includes('/recipe-media/')) {
    const filePath = mediaUrl.split('/recipe-media/')[1];
    if (filePath) {
      await supabaseClient.storage.from('recipe-media').remove([filePath]);
    }
  }

  const { error } = await supabaseClient
    .from('recipes')
    .delete()
    .eq('id', recipeId);

  if (error) {
    alert("Error deleting recipe: " + error.message);
  } else {
    fetchVaultRecipes();
  }
}

// ==========================================
// USER INBOX / STAFF MESSAGES
// ==========================================
async function fetchUserMessages() {
  const { data: messages, error } = await supabaseClient
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(username)')
    .eq('recipient_id', currentUser.id)
    .order('created_at', { ascending: false });

  const section = document.getElementById("user-messages-section");
  const list = document.getElementById("user-messages-list");

  if (error || !messages || messages.length === 0) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  list.innerHTML = messages.map(m => `
    <div class="bg-gray-900/90 border border-blue-500/30 rounded-lg p-3 flex justify-between items-start gap-3">
      <div class="space-y-1">
        <p class="text-xs font-semibold text-blue-400">From Staff (${m.sender?.username || 'Moderator'}):</p>
        <p class="text-xs text-gray-200">${m.content}</p>
      </div>
      <button type="button" onclick="dismissMessage('${m.id}')" class="text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded shrink-0">Dismiss</button>
    </div>
  `).join('');
}

async function dismissMessage(messageId) {
  const { error } = await supabaseClient
    .from('messages')
    .delete()
    .eq('id', messageId);

  if (!error) fetchUserMessages();
}

// ==========================================
// STAFF SIDEBAR: USER DIRECTORY & ACTIONS
// ==========================================
async function fetchAllUsersForStaff() {
  if (!isMod) return;

  const [{ data: profiles }, { data: admins }, { data: mods }] = await Promise.all([
    supabaseClient.from('profiles').select('*').order('username', { ascending: true }),
    supabaseClient.from('admins').select('user_id'),
    supabaseClient.from('moderators').select('user_id')
  ]);

  const adminSet = new Set((admins || []).map(a => a.user_id));
  const modSet = new Set((mods || []).map(m => m.user_id));

  allUsersCache = (profiles || []).map(p => ({
    ...p,
    isAdmin: adminSet.has(p.id),
    isMod: modSet.has(p.id)
  }));

  const searchVal = document.getElementById("user-search-input")?.value.trim().toLowerCase() || "";
  renderStaffUserList(searchVal);
}

function renderStaffUserList(searchQuery = "") {
  const listContainer = document.getElementById("staff-user-list");
  if (!listContainer) return;

  const filtered = allUsersCache.filter(u =>
    (u.username && u.username.toLowerCase().includes(searchQuery)) ||
    u.id.toLowerCase().includes(searchQuery)
  );

  if (filtered.length === 0) {
    listContainer.innerHTML = `<p class="text-xs text-gray-500 text-center py-4">No matching users found.</p>`;
    return;
  }

  listContainer.innerHTML = filtered.map(u => {
    let roleBadge = `<span class="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">Member</span>`;
    if (u.isAdmin) roleBadge = `<span class="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">Admin</span>`;
    else if (u.isMod) roleBadge = `<span class="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-bold">Mod</span>`;

    const isSelf = currentUser && u.id === currentUser.id;

    // Admin-only button to delete a moderator
    const removeModBtn = (isAdmin && u.isMod && !u.isAdmin)
      ? `<button type="button" onclick="removeModerator('${u.id}', '${u.username}')" class="text-[11px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded transition">Remove Mod</button>`
      : '';

    // Prevent deleting/messaging yourself or deleting an Admin
    const actionButtons = (!isSelf && !u.isAdmin) ? `
      <div class="flex flex-wrap gap-1.5 pt-2 border-t border-gray-800">
        <button type="button" onclick="messageUser('${u.id}', '${u.username}')" class="text-[11px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded transition">Message</button>
        <button type="button" onclick="deleteUserFiles('${u.id}', '${u.username}')" class="text-[11px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded transition">Delete Files</button>
        ${removeModBtn}
        <button type="button" onclick="deleteUserAccount('${u.id}', '${u.username}')" class="text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded transition">Delete User</button>
      </div>
    ` : `<p class="text-[10px] text-gray-500 pt-1">${isSelf ? '(You)' : 'Protected Admin'}</p>`;

    return `
      <div class="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-1.5">
        <div class="flex justify-between items-center">
          <span class="text-xs font-bold text-gray-200 truncate">${u.username}</span>
          ${roleBadge}
        </div>
        <p class="text-[10px] text-gray-500 font-mono truncate" title="${u.id}">${u.id}</p>
        ${actionButtons}
      </div>
    `;
  }).join('');
}

async function messageUser(targetUserId, username) {
  const msg = prompt(`Send a behavior / moderation message to ${username}:`);
  if (!msg || !msg.trim()) return;

  const { error } = await supabaseClient.from('messages').insert([{
    sender_id: currentUser.id,
    recipient_id: targetUserId,
    content: msg.trim()
  }]);

  if (error) {
    alert("Error sending message: " + error.message);
  } else {
    alert(`Message sent to ${username}!`);
  }
}

async function deleteUserFiles(targetUserId, username) {
  if (!confirm(`Are you sure you want to delete ALL uploaded files belonging to ${username}?`)) return;

  // 1. List and delete files inside user's storage folder
  const { data: files, error: listError } = await supabaseClient.storage
    .from('recipe-media')
    .list(targetUserId);

  if (listError) {
    return alert("Error finding user files: " + listError.message);
  }

  if (files && files.length > 0) {
    const filePaths = files.map(f => `${targetUserId}/${f.name}`);
    const { error: removeError } = await supabaseClient.storage
      .from('recipe-media')
      .remove(filePaths);

    if (removeError) {
      return alert("Error deleting files from storage: " + removeError.message);
    }
  }

  // 2. Clear media_url and file_type references on their recipes
  await supabaseClient
    .from('recipes')
    .update({ media_url: null, file_type: null })
    .eq('user_id', targetUserId);

  alert(`All files for ${username} have been deleted.`);
  fetchVaultRecipes();
}

async function removeModerator(targetUserId, username) {
  if (!isAdmin) return alert("Only Admins can remove moderators.");
  if (!confirm(`Are you sure you want to remove ${username} as a Moderator?`)) return;

  const { error } = await supabaseClient
    .from('moderators')
    .delete()
    .eq('user_id', targetUserId);

  if (error) {
    alert("Error removing moderator: " + error.message);
  } else {
    alert(`${username} is no longer a moderator.`);
    fetchAllUsersForStaff();
  }
}

async function deleteUserAccount(targetUserId, username) {
  if (!confirm(`Are you sure you want to permanently delete ${username}'s account, profile, files, and all their recipes?`)) return;

  // 1. Clean up storage files first
  const { data: files } = await supabaseClient.storage.from('recipe-media').list(targetUserId);
  if (files && files.length > 0) {
    const filePaths = files.map(f => `${targetUserId}/${f.name}`);
    await supabaseClient.storage.from('recipe-media').remove(filePaths);
  }

  // 2. Remove from moderators table if applicable
  await supabaseClient.from('moderators').delete().eq('user_id', targetUserId);

  // 3. Delete profile (cascades to delete their recipes & messages)
  const { error } = await supabaseClient
    .from('profiles')
    .delete()
    .eq('id', targetUserId);

  if (error) {
    alert("Error deleting user account: " + error.message);
  } else {
    alert(`${username}'s account and content have been deleted.`);
    fetchAllUsersForStaff();
    fetchVaultRecipes();
  }
}

// UI Navigation Toggles
function showAuthSection() {
  document.getElementById("auth-section").classList.remove("hidden");
  document.getElementById("username-setup-section").classList.add("hidden");
  document.getElementById("vault-content").classList.add("hidden");
  document.getElementById("nav-user-area").classList.add("hidden");
}

function showUsernameSetup() {
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("username-setup-section").classList.remove("hidden");
  document.getElementById("vault-content").classList.add("hidden");
  document.getElementById("nav-user-area").classList.add("hidden");
}

function showVaultContent() {
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("username-setup-section").classList.add("hidden");
  document.getElementById("vault-content").classList.remove("hidden");
  document.getElementById("nav-user-area").classList.remove("hidden");

  document.getElementById("user-display").textContent = currentProfile.username;

  const mainCol = document.getElementById("main-feed-column");
  const sidebar = document.getElementById("staff-user-sidebar");

  if (isMod) {
    document.getElementById("admin-panel")?.classList.remove("hidden");
    sidebar?.classList.remove("hidden");
    mainCol?.classList.remove("lg:col-span-3");
    mainCol?.classList.add("lg:col-span-2");

    document.getElementById("staff-role-badge").textContent = isAdmin ? "ADMIN" : "MODERATOR";

    if (isAdmin) {
      document.getElementById("admin-only-controls")?.classList.remove("hidden");
    } else {
      document.getElementById("admin-only-controls")?.classList.add("hidden");
    }

    fetchAllUsersForStaff();
  } else {
    document.getElementById("admin-panel")?.classList.add("hidden");
    sidebar?.classList.add("hidden");
    mainCol?.classList.remove("lg:col-span-2");
    mainCol?.classList.add("lg:col-span-3");
  }

  fetchUserMessages();
  fetchVaultRecipes();
}

// ==========================================
// LEGAL MODAL (PRIVACY POLICY & TERMS)
// ==========================================
function openLegalModal(tab = 'privacy') {
  const modal = document.getElementById("legal-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  switchLegalTab(tab);
}

function closeLegalModal() {
  document.getElementById("legal-modal")?.classList.add("hidden");
}

function closeLegalModalOnBackdrop(event) {
  if (event.target.id === "legal-modal") {
    closeLegalModal();
  }
}

function switchLegalTab(tab) {
  const privacyContent = document.getElementById("content-privacy");
  const termsContent = document.getElementById("content-terms");
  const tabPrivacy = document.getElementById("tab-privacy");
  const tabTerms = document.getElementById("tab-terms");

  if (tab === 'terms') {
    privacyContent?.classList.add("hidden");
    termsContent?.classList.remove("hidden");

    tabTerms.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-gray-950 transition";
    tabPrivacy.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-800 text-gray-300 hover:bg-gray-700 transition";
  } else {
    termsContent?.classList.add("hidden");
    privacyContent?.classList.remove("hidden");

    tabPrivacy.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-gray-950 transition";
    tabTerms.className = "px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-800 text-gray-300 hover:bg-gray-700 transition";
  }
}