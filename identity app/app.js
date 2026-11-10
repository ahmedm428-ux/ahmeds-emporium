// App State
let isAdmin = false;
let isMod = false;
let currentUser = null;
let currentProfile = null;

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
    else alert("Moderator added successfully!");
  });
}

// Session Checks
// Session Checks
async function checkInitialSession() {
  // If hash contains access_token from GitHub redirect, let Supabase process it
  if (window.location.hash.includes('access_token')) {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (session?.user) {
      await handleUserSignedIn(session.user);
      return;
    }
  }

  // Normal session check
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

  // If inside an iframe, break out to top window so GitHub doesn't block it
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

  // Normal top-level redirect
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
    user_id: currentUser.id
  }]);

  if (error) {
    alert("Error adding recipe: " + error.message);
  } else {
    document.getElementById("recipe-form").reset();
    fetchVaultRecipes();
  }
}

async function fetchVaultRecipes() {
  const { data: recipes, error } = await supabaseClient
    .from('recipes')
    .select('*, profiles(username)')
    .order('created_at', { ascending: false });

  if (error) return console.error("Error fetching recipes:", error);

  const container = document.getElementById("recipe-list");
  container.innerHTML = recipes.map(r => {
    let attachmentHtml = '';
    if (r.media_url) {
      if (r.file_type === 'pdf') {
        attachmentHtml = `<a href="${r.media_url}" target="_blank" class="inline-block mt-2 text-xs text-amber-500 underline font-semibold">📄 View Attached PDF</a>`;
      } else {
        attachmentHtml = `<img src="${r.media_url}" alt="${r.title}" class="mt-2 rounded border border-gray-800 max-h-48 w-full object-cover" />`;
      }
    }

    return `
      <div class="bg-gray-900 border border-gray-800 p-4 rounded-xl space-y-2">
        <h3 class="font-bold text-amber-500">${r.title}</h3>
        <p class="text-xs text-gray-400">By ${r.profiles?.username || 'Anonymous'}</p>
        <div class="text-xs text-gray-300">
          <strong>Ingredients:</strong> <pre class="font-sans whitespace-pre-wrap text-gray-400">${r.ingredients}</pre>
        </div>
        <div class="text-xs text-gray-300">
          <strong>Instructions:</strong> <p class="text-gray-400">${r.instructions}</p>
        </div>
        ${attachmentHtml}
      </div>
    `;
  }).join('');
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

  if (isMod) {
    document.getElementById("admin-panel")?.classList.remove("hidden");
    if (isAdmin) {
      document.getElementById("admin-only-controls")?.classList.remove("hidden");
    } else {
      document.getElementById("admin-only-controls")?.classList.add("hidden");
    }
  } else {
    document.getElementById("admin-panel")?.classList.add("hidden");
  }

  fetchVaultRecipes();
}