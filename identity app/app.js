// identity app/app.js

let currentUser = null;
let currentProfile = null;

const BUCKET_NAME = 'user-files';
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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

// Handle profile check upon authentication
async function handleUserSignedIn(user) {
  currentUser = user;

  // Check if profile exists
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error("Profile fetch error:", error.message);
  }

  if (!profile) {
    // First time sign-in: show username creation form
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

  fetchVaultFiles();
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

// Fetch files from Supabase Storage & display them
async function fetchVaultFiles() {
  const container = document.getElementById("files-container");
  container.innerHTML = `<p class="text-gray-400 text-sm col-span-full">Loading files...</p>`;

  // List all user folders inside bucket
  const { data: objects, error } = await supabaseClient.storage
    .from(BUCKET_NAME)
    .list('', { limit: 100 });

  if (error) {
    container.innerHTML = `<p class="text-red-400 text-sm col-span-full">Failed to load files: ${escapeHtml(error.message)}</p>`;
    return;
  }

  let allFiles = [];

  // Iterate over folders to retrieve files inside each user directory
  for (const item of objects) {
    if (item.id === null) { // Folder
      const { data: userFiles } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .list(item.name);

      if (userFiles) {
        userFiles.forEach(file => {
          allFiles.push({ ...file, folder: item.name });
        });
      }
    }
  }

  if (allFiles.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-8 bg-gray-900/50 border border-dashed border-gray-700 rounded-lg">
        <p class="text-gray-400 text-sm">No files uploaded yet.</p>
        <p class="text-xs text-amber-400/80 mt-1">Select a file above to upload to the vault!</p>
      </div>
    `;
    return;
  }

  // Render cards with signed URLs
  const cardsHtml = await Promise.all(allFiles.map(async file => {
    const fullPath = `${file.folder}/${file.name}`;
    
    // Generate signed URL valid for 1 hour
    const { data: signedData } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .createSignedUrl(fullPath, 3600);

    const signedUrl = signedData ? signedData.signedUrl : '#';
    const isOwner = file.folder === currentUser.id;
    const formattedSize = (file.metadata?.size / (1024 * 1024)).toFixed(2) + ' MB';

    return `
      <div class="bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-col justify-between space-y-3">
        <div>
          <div class="flex justify-between items-start">
            <h3 class="font-bold text-amber-300 text-sm truncate max-w-[200px]" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</h3>
            <span class="text-xs text-gray-500">${formattedSize}</span>
          </div>
          <div class="mt-3">
            ${renderMediaPreview(file.name, signedUrl)}
          </div>
        </div>

        <div class="flex justify-between items-center pt-2 border-t border-gray-800 text-xs">
          ${renderDownloadButton(file.name, signedUrl)}
          ${isOwner ? `<button onclick="deleteVaultFile('${fullPath}')" class="text-red-400 hover:text-red-300 font-semibold">Delete</button>` : '<span></span>'}
        </div>
      </div>
    `;
  }));

  container.innerHTML = cardsHtml.join('');
}

// Media renderer helper
function renderMediaPreview(fileName, url) {
  const ext = fileName.split('.').pop().toLowerCase();

  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    return `<img src="${url}" alt="${escapeHtml(fileName)}" class="w-full h-40 object-cover rounded-md" />`;
  } else if (['mp4', 'webm', 'mov'].includes(ext)) {
    return `<video src="${url}" controls class="w-full h-40 rounded-md bg-black"></video>`;
  } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
    return `<audio src="${url}" controls class="w-full mt-2"></audio>`;
  } else if (ext === 'pdf') {
    return `<a href="${url}" target="_blank" class="inline-block px-3 py-2 bg-gray-800 hover:bg-gray-700 text-amber-400 rounded text-xs border border-gray-700">📄 Open PDF in New Tab</a>`;
  } else if (ext === 'docx') {
    return `<p class="text-xs text-gray-400 italic">Word document (.docx)</p>`;
  }
  return `<p class="text-xs text-gray-400">File format preview unavailable</p>`;
}

// Download button helper
function renderDownloadButton(fileName, url) {
  const ext = fileName.split('.').pop().toLowerCase();
  if (ext === 'docx') {
    return `<a href="${url}" download class="text-amber-400 hover:underline font-medium">Download DOCX</a>`;
  }
  return `<a href="${url}" target="_blank" download class="text-amber-400 hover:underline font-medium">Download File</a>`;
}

// Real Upload with Progress reporting using XMLHttpRequest
async function handleFileUpload() {
  const fileInput = document.getElementById("file-input");
  const statusMsg = document.getElementById("upload-status-msg");
  const btnUpload = document.getElementById("btn-add-file");
  const progressContainer = document.getElementById("progress-container");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");

  statusMsg.classList.add("hidden");

  if (!fileInput.files || fileInput.files.length === 0) {
    showStatus(statusMsg, "Please select a file to upload.", "red");
    return;
  }

  const file = fileInput.files[0];

  // Browser-side validation checks
  if (file.size > MAX_SIZE_BYTES) {
    showStatus(statusMsg, "File is too large! Maximum allowed size is 10 MB.", "red");
    return;
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    showStatus(statusMsg, `File type (${file.type || 'unknown'}) is not supported.`, "red");
    return;
  }

  // Construct path: [user id]/[timestamp]-[file name]
  const timeStamp = Date.now();
  const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filePath = `${currentUser.id}/${timeStamp}-${cleanFileName}`;

  btnUpload.disabled = true;
  progressContainer.classList.remove("hidden");
  progressBar.style.width = "0%";
  progressText.textContent = "0%";

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;
    const projectUrl = config.SUPABASE_URL;

    // Direct XHR upload to report real progress percentage
    const xhr = new XMLHttpRequest();
    const uploadUrl = `${projectUrl}/storage/v1/object/${BUCKET_NAME}/${filePath}`;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `${percent}%`;
      }
    });

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        showStatus(statusMsg, "File uploaded successfully!", "green");
        fileInput.value = "";
        fetchVaultFiles();
      } else {
        showStatus(statusMsg, `Upload failed (${xhr.status}): ${xhr.responseText}`, "red");
      }
      btnUpload.disabled = false;
      progressContainer.classList.add("hidden");
    };

    xhr.onerror = function () {
      showStatus(statusMsg, "Network error during file upload.", "red");
      btnUpload.disabled = false;
      progressContainer.classList.add("hidden");
    };

    xhr.open("POST", uploadUrl, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.send(file);

  } catch (err) {
    showStatus(statusMsg, "Error: " + err.message, "red");
    btnUpload.disabled = false;
    progressContainer.classList.add("hidden");
  }
}

// Delete file from Supabase Storage
async function deleteVaultFile(fullPath) {
  if (!confirm("Are you sure you want to delete this file?")) return;

  const { error } = await supabaseClient.storage
    .from(BUCKET_NAME)
    .remove([fullPath]);

  if (error) {
    alert("Delete Error: " + error.message);
  } else {
    fetchVaultFiles();
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
  else alert("Account created successfully!");
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
  const btnAddFile = document.getElementById("btn-add-file");

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

  if (btnAddFile) {
    btnAddFile.addEventListener("click", handleFileUpload);
  }
}