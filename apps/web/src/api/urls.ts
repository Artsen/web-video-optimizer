export type UrlBuilderOptions = {
  baseUrl: string;
};

export function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function apiUrl(baseUrl: string, path: string): string {
  return `${trimBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

export function videoSourceUrl(baseUrl: string, videoId: string): string {
  return apiUrl(baseUrl, `/api/videos/${videoId}/source`);
}

export function videoDownloadUrl(baseUrl: string, videoId: string): string {
  return apiUrl(baseUrl, `/api/videos/${videoId}/download`);
}

export function jobOutputUrl(baseUrl: string, jobId: string, query = ""): string {
  return apiUrl(baseUrl, `/api/jobs/${jobId}/output${query}`);
}

export function jobDownloadUrl(baseUrl: string, jobId: string): string {
  return apiUrl(baseUrl, `/api/jobs/${jobId}/download`);
}

export function jobSidecarUrl(baseUrl: string, jobId: string): string {
  return apiUrl(baseUrl, `/api/jobs/${jobId}/sidecar`);
}

export function jobEventsUrl(baseUrl: string, jobId: string): string {
  return apiUrl(baseUrl, `/api/jobs/${jobId}/events`);
}
