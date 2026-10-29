<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Identity & Recipe Vault</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = { darkMode: 'class' }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body class="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen flex flex-col items-center justify-start p-6 transition-colors">

  <!-- Header Navigation -->
  <header class="w-full max-w-4xl flex justify-between items-center pb-6 mb-6 border-b border-gray-300 dark:border-gray-800">
    <div class="flex items-center space-x-3">
      <h1 class="text-2xl font-bold text-amber-500 dark:text-amber-400">Recipe Vault</h1>
      <button id="btn-theme-toggle" class="p-2 text-xs bg-gray-200 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700">🌙 / ☀️</button>
    </div>
    
    <div id="nav-user-area" class="hidden flex items-center space-x-3 text-xs">
      <span>Logged in as: <strong id="user-display" class="text-amber-500 dark:text-amber-300"></strong> <span id="user-badge"></span></span>
      <a href="#privacy-policy" id="btn-open-privacy" class="underline text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Privacy Policy</a>
      <button id="btn-signout" class="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-semibold rounded transition">Sign Out</button>
    </div>
  </header>

  <main class="w-full max-w-4xl space-y-8">
    
    <!-- Auth Section -->
    <section id="auth-section" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-xl max-w-md mx-auto">
      <h2 class="text-xl font-semibold mb-2 text-center">Sign In to Access Vault</h2>
      <button id="btn-github-auth" class="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2.5 rounded-lg mb-4 flex items-center justify-center space-x-2 transition">
        <span>Sign in with GitHub</span>
      </button>

      <div class="space-y-3">
        <input id="auth-email" type="email" placeholder="Email address" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
        <input id="auth-password" type="password" placeholder="Password" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
        <div class="flex space-x-2 pt-2">
          <button id="btn-email-signin" class="w-1/2 bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold py-2 rounded-lg text-sm">Sign In</button>
          <button id="btn-email-signup" class="w-1/2 bg-gray-300 dark:bg-gray-700 font-semibold py-2 rounded-lg text-sm">Sign Up</button>
        </div>
      </div>
    </section>

    <!-- Username Setup -->
    <section id="username-setup-section" class="hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-xl max-w-md mx-auto space-y-4">
      <h2 class="text-xl font-bold text-amber-400 text-center">Choose Your Username</h2>
      <div id="username-error" class="hidden text-xs text-red-400 bg-red-900/40 p-2 rounded"></div>
      <input id="input-username" type="text" placeholder="Username (3-20 chars)" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
      <button id="btn-save-username" class="w-full bg-amber-500 text-gray-900 font-bold py-2 rounded-lg text-sm">Save Username</button>
    </section>

    <!-- Vault Main Content -->
    <div id="vault-content" class="hidden space-y-8">
      
      <!-- Admin / Mod Panel -->
      <section id="admin-panel" class="hidden bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-4">
        <h3 class="text-md font-bold text-amber-500">🛡️ Staff Dashboard</h3>
        
        <!-- Admin Only Controls -->
        <div id="admin-only-controls" class="hidden space-y-3 pt-2 border-t border-amber-500/20">
          <p class="text-xs font-semibold text-gray-300">Promote Moderator:</p>
          <div class="flex space-x-2">
            <input id="mod-user-id" type="text" placeholder="Target User ID (UUID)" class="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs w-2/3" />
            <button id="btn-add-mod" class="bg-amber-500 text-gray-900 font-bold px-3 py-1 text-xs rounded">Add Mod</button>
          </div>

          <p class="text-xs font-semibold text-gray-300 mt-2">Block User:</p>
          <div class="flex space-x-2">
            <input id="block-user-id" type="text" placeholder="User ID to block (UUID)" class="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs w-2/3" />
            <button id="btn-block-user" class="bg-red-600 text-white font-bold px-3 py-1 text-xs rounded">Block User</button>
          </div>
        </div>

        <!-- Reports Area -->
        <div class="pt-2 border-t border-amber-500/20">
          <h4 class="text-xs font-semibold mb-2 text-gray-300">Pending User Reports:</h4>
          <div id="reports-list" class="text-xs space-y-2">Loading reports...</div>
        </div>
      </section>

      <!-- Post Recipe Form -->
      <section class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-xl space-y-4">
        <h2 class="text-xl font-bold text-amber-500 dark:text-amber-400">Post a Recipe</h2>
        <div id="upload-status-msg" class="hidden text-xs p-2.5 rounded-lg border"></div>

        <form id="recipe-form" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-gray-400 mb-1">Title *</label>
            <input id="recipe-title" type="text" required placeholder="e.g. Garlic Butter Pasta" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-400 mb-1">Ingredients</label>
            <textarea id="recipe-ingredients" rows="2" placeholder="Pasta, garlic, butter..." class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"></textarea>
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-400 mb-1">Instructions / Description *</label>
            <textarea id="recipe-instructions" rows="3" required placeholder="Boil pasta, saute garlic..." class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"></textarea>
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-400 mb-1">Attachment (Optional, Max 10 MB)</label>
            <input id="recipe-file" type="file" accept="image/*,video/*,audio/*,application/pdf" class="w-full text-xs text-gray-400" />
          </div>

          <!-- Progress bar -->
          <div id="progress-container" class="hidden space-y-1">
            <div class="flex justify-between text-xs text-gray-300">
              <span>Uploading attachment...</span>
              <span id="progress-text">0%</span>
            </div>
            <div class="w-full bg-gray-900 h-2 rounded-full overflow-hidden border border-gray-700">
              <div id="progress-bar" class="bg-amber-400 h-full w-0 transition-all duration-150"></div>
            </div>
          </div>

          <button id="btn-submit-recipe" type="submit" class="bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold px-5 py-2.5 rounded-lg text-sm">Publish Recipe</button>
        </form>
      </section>

      <!-- Recipe Feed -->
      <section class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-xl space-y-4">
        <h2 class="text-xl font-bold text-amber-500 dark:text-amber-400">Vault Recipes</h2>
        <div id="recipes-container" class="grid grid-cols-1 md:grid-cols-2 gap-4">Loading recipes...</div>
      </section>

      <!-- Account Data Management -->
      <section class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center text-xs gap-3">
        <div>
          <h4 class="font-bold text-sm">Your Account & Data</h4>
          <p class="text-gray-400">Export your recipes or permanently delete your account data.</p>
        </div>
        <div class="flex space-x-2">
          <button id="btn-download-data" class="bg-gray-700 hover:bg-gray-600 text-white font-bold px-3 py-1.5 rounded">Download My Data</button>
          <button id="btn-delete-account" class="bg-red-700 hover:bg-red-600 text-white font-bold px-3 py-1.5 rounded">Delete My Data</button>
        </div>
      </section>

    </div>

  </main>

  <!-- Privacy Policy Modal -->
  <div id="privacy-modal" class="hidden fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
    <div class="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full space-y-4 text-xs text-gray-300">
      <h3 class="text-lg font-bold text-amber-400">Privacy Policy</h3>
      <p><strong>What we save:</strong> Your email address, chosen username, and any recipes or files you upload to the vault.</p>
      <p><strong>Who can see it:</strong> Signed-in users can view public recipes. App moderators and admins can view reports and hide/delete inappropriate content.</p>
      <p><strong>How to delete it:</strong> Use the "Delete My Data" button on the main app page to purge all of your recipes and profile information immediately.</p>
      <button id="btn-close-privacy" class="w-full bg-amber-500 text-gray-900 font-bold py-1.5 rounded">Close Privacy Policy</button>
    </div>
  </div>

  <script src="config.js?v=3.1"></script>
  <script src="app.js?v=3.1"></script>
</body>
</html>