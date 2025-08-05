// Function to detect if text is a URL
export function isValidUrl(text: string): boolean {
  const trimmed = text.trim();

  // Basic checks: single line, reasonable length
  if (
    trimmed.includes("\n") ||
    trimmed.includes("\r") ||
    trimmed.length > 2048 ||
    trimmed.length < 4
  ) {
    return false;
  }

  // Must not contain spaces (except possibly encoded as %20)
  if (trimmed.includes(" ") && !trimmed.includes("%20")) {
    return false;
  }

  try {
    // Try to create a URL object - this is the most reliable check
    new URL(trimmed);
    return true;
  } catch {
    // If URL constructor fails, try some common patterns

    // Check for www.domain.tld pattern
    if (
      trimmed.match(
        /^www\.[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,})(\/.*)?$/
      )
    ) {
      return true;
    }

    // Check for domain.tld pattern (without protocol)
    if (
      trimmed.match(
        /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,})(\/.*)?$/
      )
    ) {
      // Common TLDs or has path/query/fragment
      const commonTlds = [
        "com",
        "org",
        "net",
        "edu",
        "gov",
        "io",
        "co",
        "uk",
        "de",
        "fr",
        "jp",
        "au",
        "ai",
        "dev",
        "app",
        "tech",
        "me",
        "ly",
        "tv",
        "cc",
        "xyz",
        "ca",
        "us",
        "ru",
        "cn",
        "br",
        "in",
      ];
      const parts = trimmed.split(".");
      const tld = parts[parts.length - 1]
        .split("/")[0]
        .split("?")[0]
        .split("#")[0]
        .toLowerCase();

      return (
        commonTlds.includes(tld) ||
        trimmed.includes("/") ||
        trimmed.includes("?") ||
        trimmed.includes("#")
      );
    }

    return false;
  }
}

// Function to normalize URL (add protocol if missing)
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  // If it already has a protocol, return as is
  if (trimmed.match(/^https?:\/\//)) {
    return trimmed;
  }

  // If it starts with www, add https
  if (trimmed.startsWith("www.")) {
    return `https://${trimmed}`;
  }

  // If it looks like a domain (contains dot and no spaces), add https
  if (trimmed.includes(".") && !trimmed.includes(" ") && trimmed.length > 4) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

// Function to parse URLs from comma-separated string
export function parseUrls(urlString: string): string[] {
  if (!urlString.trim()) return [];

  return urlString
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .map((url) => normalizeUrl(url));
}

// Function to join URLs back to comma-separated string
export function joinUrls(urls: string[]): string {
  return urls.join(", ");
}

// Function to add URL to existing URLs
export function addUrlToUrls(existingUrls: string[], newUrl: string): string[] {
  const normalizedNewUrl = normalizeUrl(newUrl);

  // Check if URL already exists
  if (existingUrls.includes(normalizedNewUrl)) {
    return existingUrls;
  }

  return [...existingUrls, normalizedNewUrl];
}

// Function to extract domain from URL
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    // If URL parsing fails, try to extract domain manually
    const domainMatch = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\?]+)/);
    return domainMatch ? domainMatch[1] : url;
  }
}

// Function to get favicon URL
export function getFaviconUrl(url: string): string {
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}
