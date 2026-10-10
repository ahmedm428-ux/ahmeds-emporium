<!-- ========================================== -->
  <!-- ===== CONFIG.JS CODE STARTS HERE ========= -->
  <!-- ========================================== -->
  <script>
    // Replace these placeholders with your actual Supabase URL and Anon Key
    const SUPABASE_URL = "https://hfalwVgzfzgpmpebdvqf.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmYWx3dmd6ZnpncG1wZWJkdnFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MTc5MzEsImV4cCI6MjEwNzE5MzkzMX0.bhg1BSbB0ngrZKTqfCCiNkbAmT6jq_EfE-3ToHn8qa8";

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