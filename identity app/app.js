// identity app/app.js - Build 2 Base Implementation

let currentUser = null;
let currentProfile = null;

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

// Session Initialization
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

// Check Sign-in status
async function handleUserSignedIn(user) {
  currentUser = user;

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) console.error("Profile fetch error:", error.message);

  if (!profile) {
    showUsernameSetup();
    return;
  }

  currentProfile = profile;
  showVaultContent();
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

  document.getElementById("user-display").textContent = currentProfile.username;

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

// Fetch & Display Recipes
async function fetchVaultRecipes() {
  const container = document.getElementById("recipes-container");
  container.innerHTML = `<p class="text-gray-400 text-xs col-span-full">Loading recipes...</p>`;

  const { data: recipes, error } = await supabaseClient
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="text-red-400 text-xs col-span-full">Failed to load recipes: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!recipes || recipes.length === 0) {
    container.innerHTML = `<p class="text-gray-400 text-xs col-span-full">No recipes in vault.</p>`;
    return;
  }

  const cardsHtml = await Promise.all(recipes.map(async (recipe) => {
    let fileUrl = null;

    if (recipe.file_path) {
      const { data: signedData } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .createSignedUrl(recipe.file_path, 3600);
      fileUrl = signedData ? signedData.signedUrl : null;
    }

    const isOwner = recipe.user_id === currentUser.id;

    return `
      <div class="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col justify-between space-y-3">
        <div>
          <h3 class="font-bold text-amber-500 text-md">${escapeHtml(recipe.title || 'Untitled')}</h3>
          ${recipe.ingredients ? `<p class="text-xs font-semibold text-gray-400 mt-2">Ingredients: ${escapeHtml(recipe.ingredients)}</p>` : ''}
          <p class="text-xs text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">${escapeHtml(recipe.instructions || '')}</p>
          
          ${fileUrl ? `<div class="mt-2">${renderMediaPreview(recipe.file_path, fileUrl)}</div>` : ''}
        </div>

        <div class="pt-2 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center text-xs">
          ${isOwner ? `<button onclick="deleteRecipe('${recipe.id}', '${recipe.file_path || ''}')" class="text-red-400 hover:underline">Delete</button>` : '<span></span>'}
        </div>
      </div>
    `;
  }));

  container.innerHTML = cardsHtml.join('');
}

function renderMediaPreview(filePath, url) {
  if (!filePath) return '';
  const ext = filePath.split('.').pop().toLowerCase();

  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    return `<img src="${url}" alt="Attachment" class="w-full h-36 object-cover rounded-md" />`;
  } else if (['mp4', 'webm', 'mov'].includes(ext)) {
    return `<video src="${url}" controls class="w-full h-36 rounded-md bg-black object-cover"></video>`;
  } else if (ext === 'pdf') {
    return `<a href="${url}" target="_blank" class="inline-block text-xs text-amber-400 underline">📄 View PDF Attachment</a>`;
  }
  return '';
}

// Recipe Form Submission
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

  if (fileInput.files && fileInput.files.length > 0) {
    const file = fileInput.files[0];

    if (file.size > MAX_SIZE_BYTES) {
      showStatus(statusMsg, "File size exceeds 10 MB limit.", "red");
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      showStatus(statusMsg, `Unsupported file type (${file.type}).`, "red");
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
          else reject(new Error(`Upload failed (${xhr.status})`));
        };

        xhr.onerror = () => reject(new Error("Network error during file upload."));

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
    showStatus(statusMsg, "Error publishing recipe: " + error.message, "red");
  } else {
    showStatus(statusMsg, "Recipe published successfully!", "green");
    document.getElementById("recipe-form").reset();
    fetchVaultRecipes();
  }
}

// Delete Recipe
async function deleteRecipe(id, filePath) {
  if (filePath) {
    await supabaseClient.storage.from(BUCKET_NAME).remove([filePath]);
  }
  await supabaseClient.from('recipes').delete().eq('id', id);
  fetchVaultRecipes();
}

// Auth Handlers
async function signInWithGitHub() {
  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      skipBrowserRedirect: true
    }
  });

  if (error) {
    alert("GitHub Auth Error: " + error.message);
  } else if (data?.url) {
    window.open(data.url, 'GitHubSignIn', 'width=600,height=700');
  }
}

async function signUpWithEmail(email, password) {
  if (!email || !password) return alert("Enter both email and password.");
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) alert("Sign Up Error: " + error.message);
  else alert("Account created! You can now sign in.");
}

async function signInWithEmail(email, password) {
  if (!email || !password) return alert("Enter both email and password.");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) alert("Sign In Error: " + error.message);
}

function showStatus(elem, msg, color) {
  elem.textContent = msg;
  elem.className = `mb-3 text-xs p-2.5 rounded-lg border ${
    color === 'green' ? 'bg-green-900/40 border-green-700 text-green-300' : 'bg-red-900/40 border-red-700 text-red-300'
  }`;
}

function showError(elem, text) {
  elem.textContent = text;
  elem.classList.remove("hidden");
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
  });

  document.getElementById("btn-save-username")?.addEventListener("click", handleSaveUsername);

  document.getElementById("recipe-form")?.addEventListener("submit", handleRecipeSubmit);
}