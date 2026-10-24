const profileImage = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=85";
const people = [
  { id: "maya", name: "Maya Chen", handle: "@mayainbloom", detail: "Plant mom & weekend wanderer", image: "photo-1531123897727-8f129e1688ce", online: true },
  { id: "noah", name: "Noah Williams", handle: "@noahw", detail: "Coffee, cameras, and coastlines", image: "photo-1500648767791-00dcc994a43e", online: true },
  { id: "ella", name: "Ella Martinez", handle: "@ellamakes", detail: "Making ordinary days lovely", image: "photo-1524504388940-b1c1722653e1", online: false },
  { id: "liam", name: "Liam Foster", handle: "@liamoutside", detail: "Usually looking for the long way", image: "photo-1506794778202-cad84cf45f1d", online: true },
  { id: "sophie", name: "Sophie Laurent", handle: "@slowmornings", detail: "A soft spot for little cafes", image: "photo-1534528741775-53994a69daeb", online: false },
];
const photo = (id, width = 720) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
const stories = [
  { id: "maya", name: "Maya", image: photo("photo-1531123897727-8f129e1688ce", 128) },
  { id: "noah", name: "Noah", image: photo("photo-1500648767791-00dcc994a43e", 128) },
  { id: "ella", name: "Ella", image: photo("photo-1524504388940-b1c1722653e1", 128) },
  { id: "liam", name: "Liam", image: photo("photo-1506794778202-cad84cf45f1d", 128) },
  { id: "sophie", name: "Sophie", image: photo("photo-1534528741775-53994a69daeb", 128) },
  { id: "jules", name: "Jules", image: photo("photo-1508214751196-bcfd4ca60f91", 128) },
  { id: "alex", name: "Alex", image: photo("photo-1507003211169-0a1dd7228f2d", 128) },
];

const posts = [
  { id: "post-1", author: people[0], image: photo("photo-1470252649378-9c29740c9fa8"), caption: "Took the long way home and found this little bit of magic. 🌿", likes: 238, comments: ["This light is unreal!", "Adding this walk to my list ✨"], time: "24 MINUTES AGO", liked: false, saved: false },
  { id: "post-2", author: people[1], image: photo("photo-1470770841072-f978cf4d019e"), caption: "A weekend with nowhere to be. More of this, please.", likes: 164, comments: ["The mountains are calling 🏔️"], time: "2 HOURS AGO", liked: false, saved: false },
  { id: "post-3", author: people[2], image: photo("photo-1490750967868-88aa4486c946"), caption: "Flowers from the tiny market around the corner. Happy Tuesday 🌷", likes: 302, comments: ["Such a lovely color palette"], time: "5 HOURS AGO", liked: false, saved: false },
];
const conversations = [
  { id: "maya", person: people[0], preview: "We should go back next weekend!", time: "2m", unread: true, messages: [{ text: "I found that little garden you were talking about 🌱", mine: false, time: "10:42" }, { text: "It’s even prettier in person. You would love it!", mine: false, time: "10:43" }, { text: "We should go back next weekend!", mine: false, time: "10:44" }] },
  { id: "noah", person: people[1], preview: "Sent you the photos 📸", time: "1h", unread: true, messages: [{ text: "The light was perfect this morning.", mine: false, time: "09:31" }, { text: "Sent you the photos 📸", mine: false, time: "09:34" }] },
  { id: "ella", person: people[2], preview: "Have the loveliest day!", time: "3h", unread: false, messages: [{ text: "Thank you for the book recommendation!", mine: false, time: "Yesterday" }, { text: "Have the loveliest day!", mine: false, time: "Yesterday" }] },
  { id: "liam", person: people[3], preview: "That trail is a must", time: "1d", unread: false, messages: [{ text: "That trail is a must", mine: false, time: "Mon" }] },
];

const state = {
  following: new Set(),
  activeView: "home",
  activeConversation: "maya",
  profileTab: "posts",
  search: "",
  ownPosts: [],
  savedPostIds: new Set(),
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const byId = (id) => document.getElementById(id);
const ACCOUNT_STORAGE_KEY = "circle.accounts.v1";
const SESSION_STORAGE_KEY = "circle.session.v1";
const GOOGLE_PKCE_VERIFIER_KEY = "circle.google.pkce-verifier";
const GOOGLE_AUTH_INTENT_KEY = "circle.google.auth-intent";
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=85";
let currentUser = null;
let pendingSignup = null;
let pendingGoogleSignup = null;
let signupPhoneInput = null;
let signupPhoneInputReady = false;
let signupPhoneInputError = "";

function initializeSignupPhoneInput() {
  if (!window.intlTelInput) {
    signupPhoneInputError = "The international phone selector could not load. Check your internet connection and reload.";
    return;
  }
  signupPhoneInput = window.intlTelInput(byId("signup-contact"), {
    initialCountry: "in",
    nationalMode: true,
    separateDialCode: true,
    countrySearch: true,
    loadUtils: () => import("https://cdn.jsdelivr.net/npm/intl-tel-input@25.12.2/build/js/utils.js"),
  });
  signupPhoneInput.promise.then(() => {
    signupPhoneInputReady = true;
  }).catch((error) => {
    signupPhoneInputError = `Phone number validation could not load: ${error.message}`;
  });
}

function supabaseConfig() {
  const config = window.CIRCLE_SUPABASE_CONFIG;
  if (!config?.url || !config?.anonKey) {
    throw new Error("Supabase isn't configured yet. Add your project URL and anon key in supabase-config.js.");
  }
  return config;
}

function base64Url(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function startGoogleAuth(intent) {
  try {
    const config = supabaseConfig();
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      throw new Error("Google sign-in needs the site served from localhost or an HTTPS address, not file://.");
    }
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    sessionStorage.setItem(GOOGLE_PKCE_VERIFIER_KEY, verifier);
    sessionStorage.setItem(GOOGLE_AUTH_INTENT_KEY, intent);
    const redirectTo = `${location.origin}${location.pathname}`;
    const authorizeUrl = new URL(`${config.url.replace(/\/$/, "")}/auth/v1/authorize`);
    authorizeUrl.searchParams.set("provider", "google");
    authorizeUrl.searchParams.set("redirect_to", redirectTo);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "s256");
    location.assign(authorizeUrl);
  } catch (error) {
    sessionStorage.removeItem(GOOGLE_PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(GOOGLE_AUTH_INTENT_KEY);
    setAuthError(`Could not start Google sign-in: ${error.message}`);
  }
}

function clearGoogleSignupMode() {
  pendingGoogleSignup = null;
  const passwordField = document.querySelector(".signup-password-field");
  const passwordInput = byId("signup-password");
  if (passwordField && passwordInput) {
    passwordField.classList.remove("hidden");
    passwordInput.required = true;
  }
  const emailInput = byId("signup-email");
  if (emailInput) emailInput.readOnly = false;
  const emailHint = byId("signup-email-hint");
  if (emailHint) emailHint.textContent = "Add an email address to verify it with a code.";
  const signupButton = byId("signup-form")?.querySelector('button[type="submit"]');
  if (signupButton) signupButton.textContent = "Create account →";
}

async function handleGoogleAuthCallback() {
  const query = new URLSearchParams(location.search);
  const code = query.get("code");
  const oauthError = query.get("error_description") || query.get("error");
  if (!code && !oauthError) return false;

  const intent = sessionStorage.getItem(GOOGLE_AUTH_INTENT_KEY);
  const verifier = sessionStorage.getItem(GOOGLE_PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(GOOGLE_AUTH_INTENT_KEY);
  sessionStorage.removeItem(GOOGLE_PKCE_VERIFIER_KEY);
  history.replaceState(null, "", location.pathname);

  try {
    if (oauthError) throw new Error(oauthError);
    if (!verifier || !intent) throw new Error("The Google sign-in session expired. Please try again.");
    const config = supabaseConfig();
    const tokenResponse = await fetch(`${config.url.replace(/\/$/, "")}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.anonKey },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    const tokenResult = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || typeof tokenResult.access_token !== "string") {
      throw new Error(tokenResult.msg || tokenResult.message || "Supabase could not complete Google sign-in.");
    }
    const userResponse = await fetch(`${config.url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: config.anonKey, Authorization: `Bearer ${tokenResult.access_token}` },
    });
    const user = await userResponse.json().catch(() => ({}));
    const emailVerified = Boolean(user.email_confirmed_at || user.user_metadata?.email_verified === true);
    if (!userResponse.ok || !user.email || user.app_metadata?.provider !== "google" || !emailVerified) {
      throw new Error("Google did not return a verified email address for this account.");
    }

    const email = user.email.toLowerCase();
    const accounts = readAccounts();
    const emailMatches = accounts.filter((savedAccount) => savedAccount.email?.toLowerCase() === email);
    const account = emailMatches.find((savedAccount) => savedAccount.authProvider === "google") || emailMatches[0];
    if (account) {
      if (account.authProvider !== "google") {
        throw new Error("This email already has a password account. Sign in with your password instead.");
      }
      finishAuthentication(account);
      return true;
    }

    setAuthMode("signup");
    pendingGoogleSignup = {
      email,
      name: String(user.user_metadata?.full_name || user.user_metadata?.name || email.split("@")[0]).slice(0, 40),
    };
    let suggestedUsername = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
    if (suggestedUsername.length < 3) suggestedUsername = `${suggestedUsername}user`.slice(0, 20);
    byId("signup-name").value = pendingGoogleSignup.name;
    byId("signup-email").value = email;
    byId("signup-email").readOnly = true;
    byId("signup-email-hint").textContent = "Email verified by Google.";
    byId("signup-password").required = false;
    document.querySelector(".signup-password-field").classList.add("hidden");
    byId("signup-username").value = suggestedUsername;
    byId("signup-form").querySelector('button[type="submit"]').textContent = "Finish Google sign up →";
    byId("auth-subtitle").textContent = "Choose a username and add your phone number to finish setting up your profile.";
    setAuthError(intent === "signin"
      ? "Google account verified. Finish your Circle profile to continue."
      : "Google account verified. Add your phone number to finish sign-up.");
    return true;
  } catch (error) {
    setAuthError(`Google sign-in failed: ${error.message}`);
    return true;
  }
}

async function signupOtpRequest(body) {
  const config = supabaseConfig();
  const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/signup-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "The verification service could not complete the request.");
  }
  return result;
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("is-visible"), 2500);
}

function readAccounts() {
  const saved = localStorage.getItem(ACCOUNT_STORAGE_KEY);
  if (!saved) return [];
  const accounts = JSON.parse(saved);
  if (!Array.isArray(accounts)) throw new Error("Saved account data is invalid. Clear this site's local data and try again.");
  return accounts;
}

function setAuthError(message = "") {
  byId("auth-error").textContent = message;
}

function normalizePhone(value) {
  return /^[+\d\s().-]+$/.test(value) ? value.replace(/[^\d+]/g, "") : "";
}

async function hashPassword(password, salt) {
  if (!window.crypto?.subtle) {
    throw new Error("Secure password storage is unavailable in this browser. Open this site using localhost or a secure browser.");
  }
  const encoder = new TextEncoder();
  const key = await window.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await window.crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: encoder.encode(salt),
    iterations: 150000,
    hash: "SHA-256",
  }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function applyCurrentUser(account) {
  currentUser = account;
  document.body.classList.add("authenticated");
  state.following.clear();
  state.ownPosts = [];
  state.savedPostIds.clear();
  document.querySelectorAll("[data-user-name]").forEach((node) => { node.textContent = account.name; });
  document.querySelectorAll("[data-user-handle]").forEach((node) => { node.textContent = `@${account.username}`; });
  document.querySelectorAll("[data-user-avatar]").forEach((image) => {
    image.src = DEFAULT_AVATAR;
    image.alt = `${account.name}'s profile photo`;
  });
  document.querySelectorAll("[data-user-bio]").forEach((node) => {
    node.textContent = account.bio || "Just joined Circle. Happy to be here! ✨";
  });
}

function finishAuthentication(account) {
  currentUser = account;
  localStorage.setItem(SESSION_STORAGE_KEY, account.username);
  applyCurrentUser(account);
  setAuthError();
  renderFeed();
  renderProfile();
  setView("profile");
}

function setAuthMode(mode) {
  const signUp = mode === "signup";
  clearGoogleSignupMode();
  pendingSignup = null;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    const selected = button.dataset.authMode === mode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  byId("signup-form").classList.toggle("hidden", !signUp);
  byId("verification-form").classList.add("hidden");
  byId("signin-form").classList.toggle("hidden", signUp);
  byId("auth-eyebrow").textContent = signUp ? "START YOUR STORY" : "WELCOME BACK";
  byId("auth-title").textContent = signUp ? "Create your account" : "Sign in to Circle";
  byId("auth-subtitle").textContent = signUp
    ? "Find your people and share a little more of life."
    : "Your little corner is right where you left it.";
  setAuthError();
}

async function createAccount(form) {
  const googleSignup = Boolean(pendingGoogleSignup);
  if (!form.reportValidity()) return;
  if (!signupPhoneInput || !signupPhoneInputReady) {
    setAuthError(signupPhoneInputError || "The country selector is loading. Please wait a moment and try again.");
    return;
  }
  const name = byId("signup-name").value.trim();
  const username = byId("signup-username").value.trim().toLowerCase();
  const email = byId("signup-email").value.trim().toLowerCase();
  const password = byId("signup-password").value;
  const normalizedPhone = signupPhoneInput.getNumber();
  const isPhone = signupPhoneInput.isValidNumber() && /^\+[1-9]\d{6,14}$/.test(normalizedPhone);
  if (name.length < 2) {
    setAuthError("Please enter a name with at least 2 characters.");
    return;
  }
  if (!isPhone) {
    setAuthError("Enter a valid phone number for the selected country.");
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setAuthError("Enter a valid email address or leave that field blank.");
    return;
  }
  let accounts;
  try {
    accounts = readAccounts();
  } catch (error) {
    setAuthError(error.message);
    return;
  }
  if (accounts.some((account) => account.username === username)) {
    setAuthError("That username is already taken. Try another one.");
    return;
  }
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton.disabled) return;
  submitButton.disabled = true;
  try {
    const account = {
      name,
      username,
      email,
      phone: normalizedPhone,
      authProvider: googleSignup ? "google" : "password",
      bio: "",
    };
    if (googleSignup) {
      if (email !== pendingGoogleSignup.email) {
        setAuthError("The verified Google email changed. Start Google sign-up again.");
        return;
      }
    } else {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltText = btoa(String.fromCharCode(...salt));
      account.salt = saltText;
      account.passwordHash = await hashPassword(password, saltText);
    }
    if (googleSignup || !email) {
      const latestAccounts = readAccounts();
      if (latestAccounts.some((savedAccount) => savedAccount.username === username)) {
        setAuthError("That username was just taken. Try another one.");
        return;
      }
      if (googleSignup && latestAccounts.some((savedAccount) => savedAccount.email?.toLowerCase() === email)) {
        setAuthError("An account with this email already exists. Sign in with its original method.");
        return;
      }
      latestAccounts.push(account);
      localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(latestAccounts));
      if (googleSignup) clearGoogleSignupMode();
      finishAuthentication(account);
      form.reset();
      return;
    }
    const { challengeId } = await signupOtpRequest({
      action: "send",
      phone: normalizedPhone,
      email,
    });
    pendingSignup = { account, challengeId };
    form.classList.add("hidden");
    byId("verification-form").reset();
    byId("verification-form").classList.remove("hidden");
    setAuthError();
  } catch (error) {
    setAuthError(`${googleSignup ? "Could not finish Google sign-up" : email ? "Could not send verification code" : "Could not create account"}: ${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
}

async function verifySignup(form) {
  if (!pendingSignup) {
    setAuthError("Please return to account details and start verification again.");
    return;
  }
  if (!form.reportValidity()) return;
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton.disabled) return;
  submitButton.disabled = true;
  try {
    try {
      await signupOtpRequest({
        action: "verify",
        challengeId: pendingSignup.challengeId,
        emailCode: byId("email-code").value,
      });
    } catch (error) {
      setAuthError(error.message);
      return;
    }
    const accounts = readAccounts();
    if (accounts.some((account) => account.username === pendingSignup.account.username)) {
      setAuthError("That username was just taken. Go back and choose another one.");
      return;
    }
    accounts.push(pendingSignup.account);
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
    const account = pendingSignup.account;
    pendingSignup = null;
    finishAuthentication(account);
    byId("signup-form").reset();
    form.reset();
  } catch (error) {
    setAuthError(`Could not finish account creation: ${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
}

async function signIn(form) {
  if (!form.reportValidity()) return;
  const identifier = byId("signin-username").value.trim().toLowerCase();
  const normalizedPhone = normalizePhone(identifier);
  const password = byId("signin-password").value;
  try {
    const accounts = readAccounts();
    const usernameMatches = accounts.filter((savedAccount) => savedAccount.username === identifier);
    const contactMatches = accounts.filter((savedAccount) =>
      savedAccount.email === identifier || (normalizedPhone && savedAccount.phone === normalizedPhone));
    const matches = usernameMatches.length ? usernameMatches : contactMatches;
    if (matches.length > 1) {
      setAuthError("This email or phone is linked to multiple accounts. Sign in with your unique username.");
      return;
    }
    const account = matches[0];
    if (account?.authProvider === "google") {
      setAuthError("This account uses Google. Choose Continue with Google to sign in.");
      return;
    }
    if (!account || !account.salt || !account.passwordHash) {
      setAuthError("We couldn't find an account with those details. Check them or create an account first.");
      return;
    }
    const passwordHash = await hashPassword(password, account.salt);
    if (passwordHash !== account.passwordHash) {
      setAuthError("That password doesn't match this account. Please try again.");
      return;
    }
    finishAuthentication(account);
    form.reset();
  } catch (error) {
    setAuthError(`Could not sign in: ${error.message}`);
  }
}

function restoreSession() {
  try {
    const identifier = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!identifier) return;
    const accounts = readAccounts();
    const account = accounts.find((savedAccount) => savedAccount.username === identifier)
      || accounts.find((savedAccount) => savedAccount.email === identifier);
    if (account) {
      applyCurrentUser(account);
      renderFeed();
      renderProfile();
      setView("profile");
      return;
    }
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    setAuthError(`Could not restore your account: ${error.message}`);
  }
}

function renderStories() {
  byId("stories-list").innerHTML = `
    <button class="story-button" type="button" data-action="create">
      <span class="story-ring add-story"><span>+</span></span><span class="story-name">Your story</span>
    </button>
    ${stories.map((story) => `
      <button class="story-button" type="button" data-story="${story.id}" aria-label="View ${story.name}'s story">
        <span class="story-ring"><img src="${story.image}" alt=""></span><span class="story-name">${story.name}</span>
      </button>`).join("")}`;
}

function renderPost(post) {
  const authorName = post.author.name;
  const commentCount = post.comments.length;
  return `<article class="post-card" data-post-id="${post.id}">
    <header class="post-header">
      <img class="avatar avatar-small" src="${post.author.image ? photo(post.author.image, 120) : profileImage}" alt="">
      <div class="post-author"><strong>${escapeHtml(authorName)}</strong><span>${escapeHtml(post.author.handle || "@olivia.rhye")} · ${post.location ? escapeHtml(post.location) : "Somewhere lovely"}</span></div>
      <button class="post-menu" type="button" data-action="post-menu" aria-label="More post options">···</button>
    </header>
    <div class="post-image-wrap"><img class="post-image" src="${post.image}" alt="A moment shared by ${escapeHtml(authorName)}" loading="lazy"></div>
    <div class="post-actions">
      <button class="post-action${post.liked ? " is-liked" : ""}" type="button" data-action="like" aria-label="${post.liked ? "Unlike" : "Like"} post" aria-pressed="${post.liked}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 4.2-8.8 10-8.8 10s-8.8-5.8-8.8-10a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3z"/></svg>
      </button>
      <button class="post-action" type="button" data-action="focus-comment" aria-label="Write a comment"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg></button>
      <button class="post-action" type="button" data-action="share-post" aria-label="Share post"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/></svg></button>
      <button class="post-action save-action${post.saved ? " is-saved" : ""}" type="button" data-action="save" aria-label="${post.saved ? "Remove from saved" : "Save post"}" aria-pressed="${post.saved}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4z"/></svg></button>
    </div>
    <div class="post-likes">${post.likes.toLocaleString()} likes</div>
    <div class="post-caption"><strong>${escapeHtml(authorName)}</strong>${escapeHtml(post.caption)}</div>
    <button class="post-comments-link" type="button" data-action="focus-comment">View all ${commentCount} ${commentCount === 1 ? "comment" : "comments"}</button>
    <div class="post-time">${escapeHtml(post.time)}</div>
    <form class="comment-form"><input type="text" maxlength="180" placeholder="Add a comment..." aria-label="Add a comment"><button type="submit">Post</button></form>
  </article>`;
}

function allPosts() {
  return [...state.ownPosts, ...posts];
}

function renderFeed() {
  const query = state.search.trim().toLowerCase();
  const filtered = allPosts().filter((post) => `${post.author.name} ${post.author.handle || ""} ${post.caption}`.toLowerCase().includes(query));
  byId("post-list").innerHTML = filtered.length
    ? filtered.map(renderPost).join("")
    : '<div class="empty-state">No moments found. Try another name or search term.</div>';
}

function followButton(person, compact = false) {
  const following = state.following.has(person.id);
  return `<button class="follow-button${following ? " is-following" : ""}" type="button" data-follow="${person.id}" aria-pressed="${following}">${following ? "Following" : compact ? "Follow" : "Follow"}</button>`;
}

function renderSuggestions() {
  const suggestions = people.filter((person) => !state.following.has(person.id)).slice(0, 3);
  byId("suggestion-list").innerHTML = suggestions.map((person) => `
    <div class="suggestion">
      <img class="avatar avatar-small" src="${photo(person.image, 100)}" alt="">
      <div class="suggestion-copy"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.detail)}</span></div>
      ${followButton(person, true)}
    </div>`).join("") || '<p class="empty-state">You’re following everyone here. Nice circle!</p>';
}

function renderConversations() {
  const query = (byId("conversation-search").value || "").toLowerCase();
  const visible = conversations.filter((conversation) => conversation.person.name.toLowerCase().includes(query));
  byId("conversation-list").innerHTML = visible.map((conversation) => `
    <button class="conversation-item${conversation.id === state.activeConversation ? " is-selected" : ""}" type="button" data-conversation="${conversation.id}">
      <span class="avatar-wrap"><img class="avatar" src="${photo(conversation.person.image, 100)}" alt="">${conversation.person.online ? '<span class="online-dot"></span>' : ""}</span>
      <span class="conversation-copy"><strong>${escapeHtml(conversation.person.name)}</strong><span>${escapeHtml(conversation.preview)}</span></span>
      <span class="conversation-meta">${conversation.time}${conversation.unread ? '<br><span class="notification-dot"></span>' : ""}</span>
    </button>`).join("") || '<div class="empty-state">No conversations found.</div>';
}

function renderChat() {
  const conversation = conversations.find((item) => item.id === state.activeConversation) || conversations[0];
  const person = conversation.person;
  byId("chat-panel").innerHTML = `
    <header class="chat-header">
      <img class="avatar" src="${photo(person.image, 100)}" alt="">
      <div class="chat-header-copy"><strong>${escapeHtml(person.name)}</strong><span>${person.online ? "Active now" : "Usually replies soon"}</span></div>
      <div class="chat-tools">
        <button class="icon-button" type="button" data-call="voice" aria-label="Start voice call"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1z"/></svg></button>
        <button class="icon-button" type="button" data-call="video" aria-label="Start video call"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg></button>
      </div>
    </header>
    <div class="chat-messages" id="chat-messages"><p class="chat-day">A little catch-up</p>
      ${conversation.messages.map((message) => `<div class="chat-bubble${message.mine ? " mine" : ""}">${escapeHtml(message.text)}</div><span class="chat-time">${escapeHtml(message.time)}</span>`).join("")}
    </div>
    <form class="chat-composer" id="message-form"><input id="message-input" type="text" maxlength="500" placeholder="Write a message..." aria-label="Write a message"><button type="submit" aria-label="Send message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/></svg></button></form>`;
  byId("chat-messages").scrollTop = byId("chat-messages").scrollHeight;
  conversation.unread = false;
  renderConversations();
}

function renderProfile() {
  const profilePosts = state.profileTab === "saved"
    ? allPosts().filter((post) => state.savedPostIds.has(post.id))
    : state.ownPosts;
  byId("profile-post-count").textContent = state.ownPosts.length;
  byId("profile-following-count").textContent = state.following.size;
  byId("profile-grid").innerHTML = profilePosts.length
    ? profilePosts.map((post) => `<button type="button" data-action="profile-post" aria-label="Open post"><img src="${post.image}" alt=""></button>`).join("")
    : `<div class="empty-state">${state.profileTab === "saved" ? "Saved moments will show up here." : "Your first post is waiting to happen."}<br><button class="profile-empty-action" type="button" data-action="create">Share a moment</button></div>`;
}

function renderExplore() {
  byId("explore-people").innerHTML = people.map((person) => `
    <article class="explore-person"><img class="avatar" src="${photo(person.image, 140)}" alt="">
      <strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.handle)}</span>
      <p>${escapeHtml(person.detail)}</p>${followButton(person)}</article>`).join("");
  byId("explore-grid").innerHTML = posts.map((post) => `<img src="${post.image}" alt="A moment shared by ${escapeHtml(post.author.name)}" loading="lazy">`).join("");
}

function renderNotifications() {
  const notifications = [
    { person: people[0], text: "liked your photo.", time: "12 min", image: posts[0].image },
    { person: people[2], text: "started following you.", time: "1 hr", follow: true },
    { person: people[1], text: "commented: “This looks like the perfect weekend.”", time: "3 hr", image: posts[1].image },
    { person: people[3], text: "and 12 others liked a moment you shared.", time: "Yesterday", image: posts[2].image },
  ];
  byId("notification-list").innerHTML = notifications.map((notification) => `
    <div class="notification-item"><img class="avatar" src="${photo(notification.person.image, 100)}" alt="">
      <p><strong>${escapeHtml(notification.person.name)}</strong> ${escapeHtml(notification.text)}<small>${notification.time}</small></p>
      ${notification.follow ? followButton(notification.person) : `<img class="notification-thumb" src="${notification.image}" alt="">`}</div>`).join("");
}

function setView(view) {
  const supportedViews = ["home", "messages", "profile", "explore", "notifications"];
  state.activeView = supportedViews.includes(view) ? view : "home";
  document.querySelectorAll(".home-view, .messages-view, .profile-view, .explore-view, .notifications-view")
    .forEach((section) => section.classList.toggle("hidden", section.id !== `${state.activeView}-view`));
  document.querySelectorAll(".nav-link[data-view], .mobile-nav-link[data-view]")
    .forEach((button) => button.classList.toggle("is-active", button.dataset.view === state.activeView));
  if (view === "search") {
    state.activeView = "home";
    document.querySelectorAll(".home-view, .messages-view, .profile-view, .explore-view, .notifications-view")
      .forEach((section) => section.classList.toggle("hidden", section.id !== "home-view"));
    byId("search-input").focus();
  }
  if (state.activeView === "messages") {
    renderConversations();
    renderChat();
  } else if (state.activeView === "profile") renderProfile();
  else if (state.activeView === "explore") renderExplore();
  else if (state.activeView === "notifications") renderNotifications();
  setMenuOpen(false);
}

function setMenuOpen(open) {
  document.body.classList.toggle("menu-open", open);
  const sidebar = byId("main-sidebar");
  sidebar.setAttribute("aria-hidden", String(!open));
  sidebar.inert = !open;
  document.querySelectorAll(".menu-toggle").forEach((button) => {
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", `${open ? "Close" : "Open"} navigation menu`);
  });
}

function toggleFollow(personId) {
  const person = people.find((item) => item.id === personId);
  if (!person) return;
  if (state.following.has(personId)) {
    state.following.delete(personId);
    showToast(`You unfollowed ${person.name}.`);
  } else {
    state.following.add(personId);
    showToast(`You’re now following ${person.name}!`);
  }
  renderSuggestions();
  renderExplore();
  renderNotifications();
  renderProfile();
}

function openCall(type) {
  const conversation = conversations.find((item) => item.id === state.activeConversation) || conversations[0];
  const video = type === "video";
  const modal = byId("call-modal");
  const controls = video
    ? `<button class="call-control" type="button" data-call-control="camera" aria-label="Turn camera off">▣</button><button class="call-control" type="button" data-call-control="mute" aria-label="Mute microphone">♩</button>`
    : `<button class="call-control" type="button" data-call-control="mute" aria-label="Mute microphone">♩</button><button class="call-control" type="button" data-call-control="speaker" aria-label="Toggle speaker">◖</button>`;
  byId("call-card").className = `call-card${video ? " video-call" : ""}`;
  byId("call-card").innerHTML = `
    <img class="call-avatar" src="${photo(conversation.person.image, 240)}" alt="">
    <h2>${escapeHtml(conversation.person.name)}</h2><p>${video ? "Starting a video call…" : "Calling…"}</p>
    <div class="call-note">This is a preview call screen. Connect a calling service to enable real audio and video.</div>
    <div class="call-controls">${controls}<button class="call-control end-call" type="button" data-action="end-call" aria-label="End call">×</button></div>
    <span class="call-state">Connecting…</span>`;
  modal.classList.remove("hidden");
}

function toggleHelp(forceOpen) {
  const chat = byId("help-chat");
  const opening = typeof forceOpen === "boolean" ? forceOpen : chat.classList.contains("hidden");
  chat.classList.toggle("hidden", !opening);
  byId("help-fab").classList.toggle("hidden", opening);
  if (opening) byId("help-input").focus();
}

function syncFullscreenButtons() {
  const isFullscreen = Boolean(document.fullscreenElement);
  document.querySelectorAll('[data-action="fullscreen"]').forEach((button) => {
    const label = `${isFullscreen ? "Exit" : "Enter"} full screen`;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  });
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    showToast(`Full screen could not be changed: ${error.message}`);
  }
}

function addHelpMessage(text) {
  const messages = byId("help-chat-messages");
  const user = document.createElement("div");
  user.className = "user-message";
  user.textContent = text;
  messages.append(user);
  const answer = document.createElement("div");
  answer.className = "bot-message";
  const lower = text.toLowerCase();
  if (lower.includes("follow")) answer.textContent = "Visit Explore or use the Follow button beside a suggestion. You can tap Following at any time to unfollow.";
  else if (lower.includes("message") || lower.includes("call") || lower.includes("chat")) answer.textContent = "Open Messages to choose a conversation and send a note. The phone and camera buttons show a preview call screen; real calls need a calling service.";
  else if (lower.includes("privacy") || lower.includes("private")) answer.textContent = "Your privacy matters. This demo keeps interactions in your browser and does not publish anything to a real social network.";
  else if (lower.includes("post") || lower.includes("photo") || lower.includes("share")) answer.textContent = "Choose Share a moment to write a caption and add a sample post to your profile and feed.";
  else answer.textContent = "I can help with following people, messages, calls, posts, and privacy. What would you like to know?";
  setTimeout(() => {
    messages.append(answer);
    messages.scrollTop = messages.scrollHeight;
  }, 250);
  messages.scrollTop = messages.scrollHeight;
}

document.addEventListener("click", (event) => {
  const target = event.target;
  const googleAuthButton = target.closest("[data-google-auth]");
  const viewButton = target.closest("[data-view]");
  const actionButton = target.closest("[data-action]");
  const follow = target.closest("[data-follow]");
  const conversationButton = target.closest("[data-conversation]");
  const callButton = target.closest("[data-call]");
  const storyButton = target.closest("[data-story]");

  if (googleAuthButton) {
    startGoogleAuth(googleAuthButton.dataset.googleAuth);
    return;
  }
  if (actionButton?.dataset.action === "toggle-menu") {
    setMenuOpen(!document.body.classList.contains("menu-open"));
    return;
  }
  if (actionButton?.dataset.action === "close-menu") {
    setMenuOpen(false);
    return;
  }
  if (viewButton) {
    setView(viewButton.dataset.view);
    return;
  }
  if (follow) {
    toggleFollow(follow.dataset.follow);
    return;
  }
  const passwordToggle = target.closest("[data-toggle-password]");
  if (passwordToggle) {
    const input = byId(passwordToggle.dataset.togglePassword);
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    passwordToggle.setAttribute("aria-label", `${visible ? "Hide" : "Show"} password`);
    passwordToggle.setAttribute("aria-pressed", String(visible));
    return;
  }
  if (conversationButton) {
    state.activeConversation = conversationButton.dataset.conversation;
    renderChat();
    return;
  }
  if (callButton) {
    openCall(callButton.dataset.call);
    return;
  }
  const callControl = target.closest("[data-call-control]");
  if (callControl) {
    callControl.classList.toggle("is-selected");
    const label = callControl.getAttribute("aria-label") || "Call control";
    showToast(`${label} ${callControl.classList.contains("is-selected") ? "on" : "off"}.`);
    return;
  }
  if (storyButton) {
    const story = stories.find((item) => item.id === storyButton.dataset.story);
    showToast(`${story ? story.name : "Your friend"}’s story is all caught up!`);
    return;
  }
  if (!actionButton) return;
  setMenuOpen(false);
  const postCard = actionButton.closest(".post-card");
  const post = postCard && allPosts().find((item) => item.id === postCard.dataset.postId);
  switch (actionButton.dataset.action) {
    case "create":
      byId("create-modal").classList.remove("hidden");
      byId("post-caption").focus();
      break;
    case "help":
      toggleHelp(true);
      break;
    case "fullscreen":
      toggleFullscreen();
      break;
    case "back-to-signup":
      pendingSignup = null;
      byId("verification-form").classList.add("hidden");
      byId("signup-form").classList.remove("hidden");
      setAuthError();
      break;
    case "close-help":
      toggleHelp(false);
      break;
    case "close-modal":
      byId("create-modal").classList.add("hidden");
      break;
    case "like":
      if (post) {
        post.liked = !post.liked;
        post.likes += post.liked ? 1 : -1;
        renderFeed();
      }
      break;
    case "save":
      if (post) {
        post.saved = !post.saved;
        if (post.saved) state.savedPostIds.add(post.id);
        else state.savedPostIds.delete(post.id);
        renderFeed();
        renderProfile();
        showToast(post.saved ? "Saved to your collection." : "Removed from your saved moments.");
      }
      break;
    case "focus-comment":
      postCard.querySelector(".comment-form input").focus();
      break;
    case "share-post":
      showToast("Your post is ready to share!");
      break;
    case "post-menu":
      showToast("You’re all caught up on this moment.");
      break;
    case "new-message":
      setView("messages");
      byId("conversation-search").focus();
      break;
    case "edit-profile":
      showToast("Profile editing is coming soon.");
      break;
    case "signout":
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        document.body.classList.remove("authenticated");
        currentUser = null;
        setAuthMode("signin");
        byId("signin-form").reset();
      } catch (error) {
        showToast(`Could not sign out: ${error.message}`);
      }
      break;
    case "menu":
      showToast("You’re already in your little corner.");
      break;
    case "profile-post":
      setView("home");
      break;
    case "end-call":
      byId("call-modal").classList.add("hidden");
      break;
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "signup-form") {
    event.preventDefault();
    createAccount(event.target);
  } else if (event.target.id === "verification-form") {
    event.preventDefault();
    verifySignup(event.target);
  } else if (event.target.id === "signin-form") {
    event.preventDefault();
    signIn(event.target);
  } else if (event.target.matches(".comment-form")) {
    event.preventDefault();
    const input = event.target.querySelector("input");
    const value = input.value.trim();
    if (!value) return;
    const card = event.target.closest(".post-card");
    const post = allPosts().find((item) => item.id === card.dataset.postId);
    if (post) {
      post.comments.push(value);
      renderFeed();
      showToast("Your comment was added.");
    }
  } else if (event.target.id === "message-form") {
    event.preventDefault();
    const input = byId("message-input");
    const value = input.value.trim();
    if (!value) return;
    const conversation = conversations.find((item) => item.id === state.activeConversation);
    conversation.messages.push({ text: value, mine: true, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
    conversation.preview = value;
    conversation.time = "now";
    renderChat();
    byId("message-input").focus();
  } else if (event.target.id === "create-form") {
    event.preventDefault();
    const caption = byId("post-caption").value.trim();
    if (!caption) {
      byId("post-caption").focus();
      showToast("Add a caption before sharing your moment.");
      return;
    }
    state.ownPosts.unshift({
      id: `own-${Date.now()}`,
      author: { name: currentUser.name, handle: `@${currentUser.username}`, image: null },
      image: photo("photo-1470252649378-9c29740c9fa8"),
      caption,
      likes: 0,
      comments: [],
      time: "JUST NOW",
      liked: false,
      saved: false,
    });
    byId("post-caption").value = "";
    byId("create-modal").classList.add("hidden");
    renderFeed();
    renderProfile();
    setView("home");
    showToast("Your moment is in your feed!");
  } else if (event.target.id === "help-form") {
    event.preventDefault();
    const input = byId("help-input");
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    addHelpMessage(value);
  }
});

byId("search-input").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderFeed();
});
byId("conversation-search").addEventListener("input", renderConversations);
document.querySelectorAll("[data-profile-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    state.profileTab = button.dataset.profileTab;
    document.querySelectorAll("[data-profile-tab]").forEach((tab) => tab.classList.toggle("is-selected", tab === button));
    renderProfile();
  });
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  });
});
document.querySelectorAll("[data-help-question]").forEach((button) => {
  button.addEventListener("click", () => {
    addHelpMessage(button.dataset.helpQuestion);
  });
});
byId("call-modal").addEventListener("click", (event) => {
  if (event.target === byId("call-modal")) byId("call-modal").classList.add("hidden");
});
byId("create-modal").addEventListener("click", (event) => {
  if (event.target === byId("create-modal")) byId("create-modal").classList.add("hidden");
});
document.addEventListener("fullscreenchange", syncFullscreenButtons);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenuOpen(false);
    byId("create-modal").classList.add("hidden");
    byId("call-modal").classList.add("hidden");
    toggleHelp(false);
  }
  if (event.target.matches("[data-call-control]")) {
    event.target.classList.toggle("is-selected");
  }
});

renderStories();
renderFeed();
renderSuggestions();
renderChat();
renderProfile();
initializeSignupPhoneInput();
setMenuOpen(false);
if (new URLSearchParams(location.search).has("code")
  || new URLSearchParams(location.search).has("error")
  || new URLSearchParams(location.search).has("error_description")) {
  void handleGoogleAuthCallback();
} else {
  restoreSession();
}
