// identity app/app.js

let currentUser = null;
let allRecipes = [];

// Initialize on page load
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
      showAuthSection();
    }
  });
}

function handleUserSignedIn(user) {
  currentUser = user;
  document.getElementById("auth-section").classList.add("hidden");
  document.getElementById("vault-content").classList.remove("hidden");
  document.getElementById("nav-user-area").classList.remove("hidden");
  
  // Display username or email
  const displayName = user.user_metadata?.preferred_username || user.user_metadata?.user_name || user.email;
  document.getElementById("user-display").textContent = displayName;

  // Load recipes only after signing in
  fetchVaultRecipes();
}

function showAuthSection() {
  document.getElementById("nav-user-area").classList.add("hidden");
  document.getElementById("vault-content").classList.add("hidden");
  document.getElementById("auth-section").classList.remove("hidden");
}

// Fetch recipes from Supabase (Only for authenticated members)
async function fetchVaultRecipes() {
  const container = document.getElementById("recipes-container");
  
  const { data: recipes, error } = await supabaseClient
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching recipes:", error.message);
    container.innerHTML = `<p class="text-red-400 text-sm col-span-full">Failed to load recipes.</p>`;
    return;
  }

  allRecipes = recipes || [];

  if (allRecipes.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-8 bg-gray-900/50 border border-dashed border-gray-700 rounded-lg">
        <p class="text-gray-400 text-sm">No recipes added yet.</p>
        <p class="text-xs text-amber-400/80 mt-1">Fill out the form above to post your first recipe!</p>
      </div>
    `;
    return;
  }

  // Display retrieved recipes as cards with images
  container.innerHTML = allRecipes.map((recipe, index) => `
    <div onclick="openRecipeModal(${index})" class="bg-gray-900 border border-gray-700 hover:border-amber-400 rounded-lg overflow-hidden cursor-pointer transition shadow hover:shadow-amber-400/10 flex flex-col">
      ${recipe.image_url ? `<img src="${escapeHtml(recipe.image_url)}" alt="${escapeHtml(recipe.title)}" class="w-full h-36 object-cover" />` : ''}
      <div class="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 class="font-bold text-amber-300 text-lg">${escapeHtml(recipe.title || 'Untitled Recipe')}</h3>
          <p class="text-xs text-gray-400 mt-1 line-clamp-2">${escapeHtml(recipe.instructions || recipe.description || 'No instructions provided.')}</p>
        </div>
        <span class="inline-block mt-3 text-xs text-amber-400 font-medium">Click to view recipe &rarr;</span>
      </div>
    </div>
  `).join('');
}

// Open modal with full recipe details
function openRecipeModal(index) {
  const recipe = allRecipes[index];
  if (!recipe) return;

  document.getElementById("modal-title").textContent = recipe.title || 'Untitled Recipe';
  
  const modalImgContainer = document.getElementById("modal-image-container");
  const modalImg = document.getElementById("modal-image");

  if (recipe.image_url) {
    modalImg.src = recipe.image_url;
    modalImgContainer.classList.remove("hidden");
  } else {
    modalImgContainer.classList.add("hidden");
  }

  const ingredientsElem = document.getElementById("modal-ingredients");
  const ingredientsContainer = document.getElementById("modal-ingredients-container");

  if (recipe.ingredients) {
    ingredientsElem.textContent = recipe.ingredients;
    ingredientsContainer.classList.remove("hidden");
  } else {
    ingredientsContainer.classList.add("hidden");
  }

  document.getElementById("modal-instructions").textContent = recipe.instructions || recipe.description || 'No detailed instructions provided.';
  
  document.getElementById("recipe-modal").classList.remove("hidden");
}

function closeRecipeModal() {
  document.getElementById("recipe-modal").classList.add("hidden");
}

// Upload image to Supabase storage bucket
async function uploadRecipeImage(file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `recipes/${fileName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from('recipe-images')
    .upload(filePath, file);

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabaseClient.storage
    .from('recipe-images')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

// Add new recipe to Supabase
async function handleAddRecipe(e) {
  e.preventDefault();

  if (!currentUser) {
    alert("You must be signed in to post a recipe.");
    return;
  }

  const submitBtn = document.getElementById("btn-submit-recipe");
  submitBtn.disabled = true;
  submitBtn.textContent = "Uploading...";

  try {
    const title = document.getElementById("recipe-title").value.trim();
    const ingredients = document.getElementById("recipe-ingredients").value.trim();
    const instructions = document.getElementById("recipe-instructions").value.trim();
    const fileInput = document.getElementById("recipe-file");
    
    let imageUrl = null;

    if (fileInput.files && fileInput.files[0]) {
      imageUrl = await uploadRecipeImage(fileInput.files[0]);
    }

    const { error } = await supabaseClient
      .from('recipes')
      .insert([
        {
          title: title,
          ingredients: ingredients,
          instructions: instructions,
          image_url: imageUrl,
          user_id: currentUser.id
        }
      ]);

    if (error) {
      alert("Error saving recipe: " + error.message);
    } else {
      document.getElementById("recipe-form").reset();
      fetchVaultRecipes();
    }
  } catch (err) {
    alert("Failed to post recipe: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Publish Recipe";
  }
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

// Helper to escape HTML characters
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Event Listeners
function setupEventListeners() {
  const btnSignup = document.getElementById("btn-email-signup");
  const btnSignin = document.getElementById("btn-email-signin");
  const btnGithub = document.getElementById("btn-github-auth");
  const btnSignout = document.getElementById("btn-signout");
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

  if (recipeForm) {
    recipeForm.addEventListener("submit", handleAddRecipe);
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