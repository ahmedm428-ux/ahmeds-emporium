// identity app/app.js

let currentUser = null;

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  checkInitialSession();
  fetchPublicRecipes(); // Load public recipes immediately for everyone
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
      showAuthSection();
    }
  });
}

function handleUserSignedIn(user) {
  currentUser = user;
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("nav-user-area").classList.remove("hidden");
  
  // Display username or email
  const displayName = user.user_metadata?.preferred_username || user.user_metadata?.user_name || user.email;
  document.getElementById("user-display").textContent = displayName;
}

function showAuthSection() {
  document.getElementById("nav-user-area").classList.add("hidden");
  document.getElementById("auth-section").classList.remove("hidden");
}

// Fetch Public Recipes from Supabase
async function fetchPublicRecipes() {
  const container = document.getElementById("recipes-container");
  
  const { data: recipes, error } = await supabaseClient
    .from('recipes')
    .select('*');

  if (error || !recipes || recipes.length === 0) {
    // Demo fallback recipes if table isn't populated yet
    container.innerHTML = `
      <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
        <h3 class="font-bold text-amber-300 text-lg">Classic Garlic Butter Pasta</h3>
        <p class="text-sm text-gray-300 mt-1">Simple garlic, olive oil, parmesan, and spaghetti boiled to perfection.</p>
      </div>
      <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
        <h3 class="font-bold text-amber-300 text-lg">Signature Homemade Burger</h3>
        <p class="text-sm text-gray-300 mt-1">Juicy beef patty, toasted brioche bun, cheddar cheese, and secret sauce.</p>
      </div>
    `;
    return;
  }

  // Display retrieved public recipes
  container.innerHTML = recipes.map(recipe => `
    <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <h3 class="font-bold text-amber-300 text-lg">${recipe.title || 'Untitled Recipe'}</h3>
      <p class="text-sm text-gray-300 mt-1">${recipe.instructions || recipe.description || ''}</p>
    </div>
  `).join('');
}

// Sign In Handler (GitHub OAuth - Popup Window)
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

// Sign Up Handler (Email)
async function signUpWithEmail(email, password) {
  if (!email || !password) {
    alert("Please enter both an email and password.");
    return;
  }
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) alert("Sign Up Error: " + error.message);
  else alert("Account created successfully!");
}

// Sign In Handler (Email)
async function signInWithEmail(email, password) {
  if (!email || !password) {
    alert("Please enter both an email and password.");
    return;
  }
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) alert("Sign In Error: " + error.message);
}

// Event Listeners
function setupEventListeners() {
  const btnSignup = document.getElementById("btn-email-signup");
  const btnSignin = document.getElementById("btn-email-signin");
  const btnGithub = document.getElementById("btn-github-auth");
  const btnSignout = document.getElementById("btn-signout");

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
}