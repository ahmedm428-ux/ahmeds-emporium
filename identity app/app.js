// identity app/app.js

let currentUser = null;

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  checkInitialSession();
});

// Listen for Auth changes and keep session active on refresh
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
  document.getElementById("dashboard-section").classList.remove("hidden");
  document.getElementById("nav-user-area").classList.remove("hidden");
  
  // Display GitHub username or Email
  const displayName = user.user_metadata?.preferred_username || user.user_metadata?.user_name || user.email;
  document.getElementById("user-display").textContent = displayName;
}

function showAuthSection() {
  document.getElementById("dashboard-section").classList.add("hidden");
  document.getElementById("nav-user-area").classList.add("hidden");
  document.getElementById("auth-section").classList.remove("hidden");
}

// Sign Up Handler (Email)
async function signUpWithEmail(email, password) {
  if (!email || !password) {
    alert("Please enter both an email and password.");
    return;
  }
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    alert("Sign Up Error: " + error.message);
  } else {
    alert("Account created successfully!");
  }
}

// Sign In Handler (Email)
async function signInWithEmail(email, password) {
  if (!email || !password) {
    alert("Please enter both an email and password.");
    return;
  }
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Sign In Error: " + error.message);
  }
}

// Sign In Handler (GitHub OAuth)
async function signInWithGitHub() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });
  
  if (error) {
    alert("GitHub Sign In Error: " + error.message);
  }
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

  if (btnGithub) {
    btnGithub.addEventListener("click", signInWithGitHub);
  }

  if (btnSignout) {
    btnSignout.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
    });
  }
}