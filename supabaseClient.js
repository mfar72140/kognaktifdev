import { createClient } from  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

export const supabase = createClient(
  "https://ijugaqvsszticpzrznnb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdWdhcXZzc3p0aWNwenJ6bm5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2MjIwMjksImV4cCI6MjA3MzE5ODAyOX0.kx29Dr1eAIKdeRwpH9VBYerKuHYWz2wIvNYc85ms5mY"
);
