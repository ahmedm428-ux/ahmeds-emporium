<!-- ========================================== -->
  <!-- ===== CONFIG.JS CODE STARTS HERE ========= -->
  <!-- ========================================== -->
  <script>
    // Replace these placeholders with your actual Supabase URL and Anon Key
    const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
    const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

    // Client instance used throughout the app
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const APP_CONFIG = {
      maxFileSizeMB: 5,
      allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      minPasswordLength: 8
    };
  </script>
  <!-- ========================================== -->
  <!-- ===== CONFIG.JS CODE ENDS HERE =========== -->
  <!-- ========================================== -->