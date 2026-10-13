// identity app/app.js

let currentUser = null;
let currentProfile = null;
let allRecipes = [];

const BUCKET_NAME = 'user-files';
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'application/pdf'
];

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  checkInitialSession();
});

// Check session on load & listen for auth state changes
async function checkInitialSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    handleUserSignedIn(session.user);
  } else {
    showAuthSection();
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) {
      handleUserSignedIn(session.user);
    } else {
      currentUser = null;
      currentProfile = null;
      showAuthSection();
    }
  });
}

// Check profile row after Email or GitHub login
async function handleUserSignedIn(user) {
  currentUser = user;

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error("Profile fetch error:", error.message);
  }

  if (!profile) {
    // Show username setup form right after sign up or first login
    showUsernameSetup();
  } else {
    currentProfile = profile;
    showVaultContent();
  }
}

function showAuthSection() {
  document.getElementById("nav-user-area").classList.add("hidden");
  document.getElementById("vault-content").classList.add("hidden");
  document.getElementById("username-setup-section").classList.add("hidden");
  document.getElementById("auth-section").classList.remove("hidden");
}

function showUsernameSetup() {
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("vault-content").classList.add("hidden");
  document.getElementById("username-setup-section").classList.remove("hidden");
}

function showVaultContent() {
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("username-setup-section").classList.add("hidden");
  document.getElementById("vault-content").classList.remove("hidden");
  document.getElementById("nav-user-area").classList.remove("hidden");

  document.getElementById("user-display").textContent = currentProfile ? currentProfile.username : currentUser.email;

  fetchVaultRecipes();
}

// Save Username Handler
async function handleSaveUsername() {
  const usernameInput = document.getElementById("input-username").value.trim();
  const errorElem = document.getElementById("username-error");
  errorElem.classList.add("hidden");

  if (usernameInput.length < 3 || usernameInput.length > 20) {
    showError(errorElem, "Username must be between 3 and 20 characters.");
    return;
  }

  const { data, error } = await supabaseClient
    .from('profiles')
    .insert([{ id: currentUser.id, username: usernameInput }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      showError(errorElem, "That username is taken. Please choose another.");
    } else {
      showError(errorElem, "Error saving username: " + error.message);
    }
  } else {
    currentProfile = data;
    showVaultContent();
  }
}

function showError(elem, text) {
  elem.textContent = text;
  elem.classList.remove("hidden");
}

// Fetch recipes from Supabase Database
async function fetchVaultRecipes() {
  const container = document.getElementById("recipes-container");
  container.innerHTML = `<p class="text-gray-400 text-sm col-span-full">Loading recipes...</p>`;

  const { data: recipes, error } = await supabaseClient
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="text-red-400 text-sm col-span-full">Failed to load recipes: ${escapeHtml(error.message)}</p>`;
    return;
  }

  allRecipes = recipes || [];

  if (allRecipes.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-8 bg-gray-900/50 border border-dashed border-gray-700 rounded-lg">
        <p class="text-gray-400 text-sm">No recipes added yet.</p>
        <p class="text-xs text-amber-400/80 mt-1">Publish the first recipe using the form above!</p>
      </div>
    `;
    return;
  }

  // Render cards with signed URLs for attached images
  const cardsHtml = await Promise.all(allRecipes.map(async (recipe, index) => {
    let fileUrl = null;

    if (recipe.file_path) {
      const { data: signedData } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .createSignedUrl(recipe.file_path, 3600);
      fileUrl = signedData ? signedData.signedUrl : null;
    }

    const isOwner = recipe.user_id === currentUser.id;

    return `
      <div onclick="openRecipeModal(${index}, '${fileUrl || ''}')" class="bg-gray-900 border border-gray-700 hover:border-amber-400 rounded-lg overflow-hidden cursor-pointer transition shadow hover:shadow-amber-400/10 flex flex-col justify-between p-4 space-y-3">
        <div>
          <h3 class="font-bold text-amber-300 text-lg">${escapeHtml(recipe.title || 'Untitled Recipe')}</h3>
          <p class="text-xs text-gray-400 mt-1 line-clamp-2">${escapeHtml(recipe.instructions || 'No instructions provided.')}</p>
        </div>

        ${fileUrl ? `<div class="mt-2">${renderMediaPreview(recipe.file_path, fileUrl)}</div>` : ''}

        <div class="flex justify-between items-center pt-2 border-t border-gray-800 text-xs">
          <span class="text-amber-400 font-medium">Click to view &rarr;</span>
          ${isOwner ? `<button onclick="event.stopPropagation(); deleteRecipe(${recipe.id}, '${recipe.file_path || ''}')" class="text-red-400 hover:text-red-300 font-semibold">Delete</button>` : '<span></span>'}
        </div>
      </div>
    `;
  }));

  container.innerHTML = cardsHtml.join('');
}

// Media preview generator
function renderMediaPreview(filePath, url) {
  if (!filePath) return '';
  const ext = filePath.split('.').pop().toLowerCase();

  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    return `<img src="${url}" alt="Food image" class="w-full h-36 object-cover rounded-md" />`;
  } else if (['mp4', 'webm', 'mov'].includes(ext)) {
    return `<video src="${url}" class="w-full h-36 rounded-md bg-black object-cover"></video>`;
  } else if (ext === 'pdf') {
    return `<p class="text-xs text-amber-400 bg-gray-800 p-2 rounded">📄 PDF Attachment Included</p>`;
  }
  return '';
}

// Open modal to view full recipe details
function openRecipeModal(index, fileUrl) {
  const recipe = allRecipes[index];
  if (!recipe) return;

  document.getElementById("modal-title").textContent = recipe.title || 'Untitled Recipe';
  
  const imgContainer = document.getElementById("modal-image-container");
  if (fileUrl) {
    imgContainer.innerHTML = renderMediaPreview(recipe.file_path, fileUrl);
    imgContainer.classList.remove("hidden");
  } else {
    imgContainer.classList.add("hidden");
  }

  const ingredientsElem = document.getElementById("modal-ingredients");
  const ingredientsContainer = document.getElementById("modal-ingredients-container");

  if (recipe.ingredients) {
    ingredientsElem.textContent = recipe.ingredients;
    ingredientsContainer.classList.remove("hidden");
  } else {
    ingredientsContainer.classList.add("hidden");
  }

  document.getElementById("modal-instructions").textContent = recipe.instructions || 'No detailed instructions provided.';
  
  document.getElementById("recipe-modal").classList.remove("hidden");
}

function closeRecipeModal() {
  document.getElementById("recipe-modal").classList.add("hidden");
}

// Post recipe with text and optional file attachment
// Post recipe with text and optional file attachment
// Post recipe with text and optional file attachment
async function handleRecipeSubmit(e) {
  e.preventDefault();

  const title = document.getElementById("recipe-title").value.trim();
  const ingredients = document.getElementById("recipe-ingredients").value.trim();
  const instructions = document.getElementById("recipe-instructions").value.trim();
  const fileInput = document.getElementById("recipe-file");
  const statusMsg = document.getElementById("upload-status-msg");
  const btnSubmit = document.getElementById("btn-submit-recipe");
  const progressContainer = document.getElementById("progress-container");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");

  statusMsg.classList.add("hidden");

  let filePath = null;

  // Handle file upload if attached
  if (fileInput.files && fileInput.files.length > 0) {
    const file = fileInput.files[0];

    if (file.size > MAX_SIZE_BYTES) {
      showStatus(statusMsg, "File is too large! Maximum allowed size is 10 MB.", "red");
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      showStatus(statusMsg, `File type (${file.type || 'unknown'}) is not supported.`, "red");
      return;
    }

    const timeStamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    filePath = `${currentUser.id}/${timeStamp}-${cleanFileName}`;

    btnSubmit.disabled = true;
    progressContainer.classList.remove("hidden");
    progressBar.style.width = "0%";
    progressText.textContent = "0%";

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      
      const projectUrl = supabaseClient.supabaseUrl;

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const uploadUrl = `${projectUrl}/storage/v1/object/${BUCKET_NAME}/${filePath}`;

        xhr.upload.addEventListener("progress", (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.round((evt.loaded / evt.total) * 100);
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `${percent}%`;
          }
        });

        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Storage error (${xhr.status}): ${xhr.responseText}`));
        };

        xhr.onerror = () => reject(new Error("Network error uploading attachment."));

        xhr.open("POST", uploadUrl, true);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.send(file);
      });

    } catch (err) {
      showStatus(statusMsg, err.message, "red");
      btnSubmit.disabled = false;
      progressContainer.classList.add("hidden");
      return;
    }
  }

  // Save recipe to Database table
  const { error } = await supabaseClient
    .from('recipes')
    .insert([{
      title: title,
      ingredients: ingredients,
      instructions: instructions,
      file_path: filePath,
      user_id: currentUser.id
    }]);

  btnSubmit.disabled = false;
  progressContainer.classList.add("hidden");

  if (error) {
    showStatus(statusMsg, "Error saving recipe: " + error.message, "red");
  } else {
    showStatus(statusMsg, "Recipe published successfully!", "green");
    document.getElementById("recipe-form").reset();
    fetchVaultRecipes();
  }
}

// Delete recipe and its file
async function deleteRecipe(id, filePath) {
  if (!confirm("Are you sure you want to delete this recipe?")) return;

  if (filePath) {
    await supabaseClient.storage.from(BUCKET_NAME).remove([filePath]);
  }

  const { error } = await supabaseClient
    .from('recipes')
    .delete()
    .eq('id', id);

  if (error) {
    alert("Delete error: " + error.message);
  } else {
    fetchVaultRecipes();
  }
}

function showStatus(elem, msg, color) {
  elem.textContent = msg;
  elem.className = `mb-3 text-xs p-2.5 rounded-lg border ${
    color === 'green' ? 'bg-green-900/40 border-green-700 text-green-300' : 'bg-red-900/40 border-red-700 text-red-300'
  }`;
}

// OAuth Popup Handler
async function signInWithGitHub() {
  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      skipBrowserRedirect: true
    }
  });

  if (error) {
    alert("GitHub Sign In Error: " + error.message);
  } else if (data?.url) {
    const width = 600;
    const height = 700;
    const left = (window.innerWidth - width) / 2 + window.screenX;
    const top = (window.innerHeight - height) / 2 + window.screenY;

    window.open(
      data.url,
      'GitHubSignIn',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
    );
  }
}

async function signUpWithEmail(email, password) {
  if (!email || !password) {
    alert("Please enter both an email and password.");
    return;
  }
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) alert("Sign Up Error: " + error.message);
  else alert("Account created successfully! Check your email or sign in.");
}

async function signInWithEmail(email, password) {
  if (!email || !password) {
    alert("Please enter both an email and password.");
    return;
  }
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) alert("Sign In Error: " + error.message);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setupEventListeners() {
  const btnSignup = document.getElementById("btn-email-signup");
  const btnSignin = document.getElementById("btn-email-signin");
  const btnGithub = document.getElementById("btn-github-auth");
  const btnSignout = document.getElementById("btn-signout");
  const btnSaveUsername = document.getElementById("btn-save-username");
  const recipeForm = document.getElementById("recipe-form");
  const modalClose = document.getElementById("modal-close");
  const modalOverlay = document.getElementById("recipe-modal");

  if (btnSignup) {
    btnSignup.addEventListener("click", () => {
      const email = document.getElementById("auth-email").value;
      const password = document.getElementById("auth-password").value;
      signUpWithEmail(email, password);
    });
  }

  if (btnSignin) {
    btnSignin.addEventListener("click", () => {
      const email = document.getElementById("auth-email").value;
      const password = document.getElementById("auth-password").value;
      signInWithEmail(email, password);
    });
  }

  if (btnGithub) btnGithub.addEventListener("click", signInWithGitHub);

  if (btnSignout) {
    btnSignout.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
    });
  }

  if (btnSaveUsername) {
    btnSaveUsername.addEventListener("click", handleSaveUsername);
  }

  if (recipeForm) {
    recipeForm.addEventListener("submit", handleRecipeSubmit);
  }

  if (modalClose) {
    modalClose.addEventListener("click", closeRecipeModal);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeRecipeModal();
    });
  }
}