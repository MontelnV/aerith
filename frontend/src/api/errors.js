const DETAIL_MESSAGES = {
  "Invalid credentials": "Invalid login or password",
  "Invalid login or password": "Invalid login or password",
  "Not authenticated": "Please sign in",
  "Invalid or expired token": "Session expired. Please sign in again.",
  "Invalid token subject": "Session expired. Please sign in again.",
  "User not found or inactive": "Account unavailable or disabled",
  "No refresh token": "Session expired. Please sign in again.",
  "Invalid refresh token": "Session expired. Please sign in again.",
  "Refresh token revoked": "Session expired. Please sign in again.",
  "User not found": "User not found",
  "Current password is incorrect": "Current password is incorrect",
  "Invalid invite": "Invalid invitation",
  "Invite expired": "Invitation has expired",
  "Login already taken": "This login is already taken",
};

export async function parseErrorDetail(response) {
  try {
    const data = await response.json();
    if (!data?.detail) return null;
    const { detail } = data;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => item?.msg || item?.message || String(item))
        .filter(Boolean)
        .join(". ");
    }
    return JSON.stringify(detail);
  } catch {
    return null;
  }
}

export function isCredentialAuthPath(url) {
  const path = url.replace(/^https?:\/\/[^/]+/i, "").split("?")[0];
  return path === "/auth/login" || path.endsWith("/auth/login");
}

export function humanizeApiError(detail, status, { credentialForm = false } = {}) {
  if (detail && DETAIL_MESSAGES[detail]) return DETAIL_MESSAGES[detail];
  if (detail) return detail;
  if (status === 401) {
    return credentialForm ? "Invalid login or password" : "Authentication required";
  }
  return `HTTP error ${status}`;
}
