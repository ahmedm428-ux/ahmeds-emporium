<!-- ========================================== -->
  <!-- ===== APP.JS CODE STARTS HERE ============ -->
  <!-- ========================================== -->
  <script>
    // Active session state
    let currentUser = null;
    let currentProfile = null;

    // --- INITIALIZATION ---
    document.addEventListener("DOMContentLoaded", () => {
      setupEventListeners();
      checkInitialSession();
    });

    // Check if user is already logged in (Persisted session)
    async function checkInitialSession() {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        handleUserSignedIn(session.user);
      } else {
        showAuthSection();
      }

      // Auth state change listener (Handles refresh, sign-in, sign-out)
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_IN" && session) {
          handleUserSignedIn(session.user);
        } else if (event === "SIGNED_OUT") {
          currentUser = null;
          currentProfile = null;
          showAuthSection();
        }
      });
    }

    // --- AUTHENTICATION HANDLERS ---
    async function handleUserSignedIn(user) {
      currentUser = user;

      // Fetch Profile to check for username
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profile || !profile.username) {
        // Show onboarding modal for initial username setup
        document.getElementById("onboarding-modal").classList.remove("hidden");
      } else {
        currentProfile = profile;
        document.getElementById("onboarding-modal").classList.add("hidden");
        showDashboard();
      }
    }

    // Password Rules Validation (Min 8 chars, uppercase, lowercase, number)
    function validatePassword(password) {
      const minLength = password.length >= APP_CONFIG.minPasswordLength;
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasNum = /[0-9]/.test(password);
      return minLength && hasUpper && hasLower && hasNum;
    }

    // Email/Password Sign Up
    async function signUpWithEmail(email, password) {
      if (!validatePassword(password)) {
        alert("Password must be at least 8 characters long and contain uppercase, lowercase, and a number.");
        return;
      }
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) alert(error.message);
      else alert("Sign up successful! Please check your email for confirmation.");
    }

    // Email/Password Sign In
    async function signInWithEmail(email, password) {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }

    // GitHub OAuth Sign In
    async function signInWithGitHub() {
      const { error } = await supabaseClient.auth.signInWithOAuth({ provider: "github" });
      if (error) alert(error.message);
    }

    // Save Username
    async function saveUsername() {
      const username = document.getElementById("input-username").value.trim();
      if (!username) return alert("Please enter a username");

      const { error } = await supabaseClient
        .from("profiles")
        .upsert({ id: currentUser.id, username, updated_at: new Date() });

      if (error) {
        alert("Username may already be taken. Choose another.");
      } else {
        handleUserSignedIn(currentUser);
      }
    }

    // Update Password
    async function changePassword() {
      const newPassword = document.getElementById("new-password").value;
      if (!validatePassword(newPassword)) {
        alert("New password does not meet requirements (8+ chars, uppercase, lowercase, number).");
        return;
      }
      const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
      if (error) alert(error.message);
      else {
        alert("Password updated successfully!");
        document.getElementById("password-modal").classList.add("hidden");
      }
    }

    // --- RECIPE & FILE MANAGEMENT ---
    async function fetchUserRecipes() {
      const { data: recipes, error } = await supabaseClient
        .from("recipes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        return;
      }

      const listContainer = document.getElementById("recipes-list");
      listContainer.innerHTML = "";

      if (!recipes || recipes.length === 0) {
        listContainer.innerHTML = `<p class="text-gray-400 text-sm col-span-2">No recipes yet. Add one above!</p>`;
        return;
      }

      recipes.forEach(recipe => {
        const card = document.createElement("div");
        card.className = "bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col justify-between";
        card.innerHTML = `
          <div>
            <h4 class="font-bold text-amber-400 text-lg mb-1">${escapeHtml(recipe.title)}</h4>
            <p class="text-sm text-gray-300 whitespace-pre-wrap">${escapeHtml(recipe.instructions)}</p>
          </div>
          ${recipe.file_url ? `
            <div class="mt-4 pt-2 border-t border-gray-700">
              <a href="${recipe.file_url}" target="_blank" class="text-xs text-amber-500 hover:underline">View Attached File / Image ↗</a>
            </div>
          ` : ''}
        `;
        listContainer.appendChild(card);
      });
    }

    async function createRecipe(e) {
      e.preventDefault();
      const title = document.getElementById("recipe-title").value.trim();
      const instructions = document.getElementById("recipe-instructions").value.trim();
      const fileInput = document.getElementById("recipe-file");
      const file = fileInput.files[0];

      let fileUrl = null;

      if (file) {
        // Validate File Size
        if (file.size > APP_CONFIG.maxFileSizeMB * 1024 * 1024) {
          alert(`File size exceeds the ${APP_CONFIG.maxFileSizeMB}MB limit.`);
          return;
        }
        // Validate File Type
        if (!APP_CONFIG.allowedFileTypes.includes(file.type)) {
          alert("Invalid file type. Allowed: JPG, PNG, WEBP, PDF.");
          return;
        }

        // Upload file into user's isolated path
        const filePath = `${currentUser.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabaseClient.storage
          .from("recipe-files")
          .upload(filePath, file);

        if (uploadError) {
          alert("File upload failed: " + uploadError.message);
          return;
        }

        // Get public URL
        const { data: urlData } = supabaseClient.storage
          .from("recipe-files")
          .getPublicUrl(filePath);

        fileUrl = urlData.publicUrl;
      }

      // Insert recipe row into database
      const { error: dbError } = await supabaseClient
        .from("recipes")
        .insert([{ title, instructions, file_url: fileUrl, user_id: currentUser.id }]);

      if (dbError) {
        alert("Database error: " + dbError.message);
      } else {
        document.getElementById("recipe-form").reset();
        fetchUserRecipes();
      }
    }

    // --- UI DISPLAY HELPERS ---
    function showDashboard() {
      document.getElementById("auth-section").classList.add("hidden");
      document.getElementById("dashboard-section").classList.remove("hidden");
      document.getElementById("nav-user-area").classList.remove("hidden");
      document.getElementById("user-display").textContent = `@${currentProfile.username}`;
      fetchUserRecipes();
    }

    function showAuthSection() {
      document.getElementById("dashboard-section").classList.add("hidden");
      document.getElementById("nav-user-area").classList.add("hidden");
      document.getElementById("auth-section").classList.remove("hidden");
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.innerText = text;
      return div.innerHTML;
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
      document.getElementById("btn-email-signup").addEventListener("click", () => {
        const email = document.getElementById("auth-email").value;
        const password = document.getElementById("auth-password").value;
        signUpWithEmail(email, password);
      });

      document.getElementById("btn-email-signin").addEventListener("click", () => {
        const email = document.getElementById("auth-email").value;
        const password = document.getElementById("auth-password").value;
        signInWithEmail(email, password);
      });

      document.getElementById("btn-github-auth").addEventListener("click", signInWithGitHub);
      document.getElementById("btn-save-username").addEventListener("click", saveUsername);
      document.getElementById("btn-signout").addEventListener("click", () => supabaseClient.auth.signOut());

      document.getElementById("btn-nav-change-pw").addEventListener("click", () => {
        document.getElementById("password-modal").classList.remove("hidden");
      });

      document.getElementById("btn-close-pw-modal").addEventListener("click", () => {
        document.getElementById("password-modal").classList.add("hidden");
      });

      document.getElementById("btn-update-pw").addEventListener("click", changePassword);
      document.getElementById("recipe-form").addEventListener("submit", createRecipe);
    }
  </script>
  <!-- ========================================== -->
  <!-- ===== APP.JS CODE ENDS HERE ============== -->
  <!-- ========================================== -->