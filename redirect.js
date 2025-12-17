// redirect.js
import { supabase } from './supabaseClient.js'; // relative path from redirect.js

const redirectIfLoggedIn = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      if (!window.location.hostname.startsWith('apps.')) {
        window.location.href = 'https://apps.kognaktif.com';
      }
    }
  } catch (err) {
    console.error('Error checking session:', err);
  }
};

redirectIfLoggedIn();
