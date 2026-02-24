// Ex OpenCOR web app
//

import * as vue from 'vue';

import packageJson from '../../package.json' with { type: 'json' };

import { electronApi } from './electronApi.ts';

const VERSION_CHECK_INTERVAL = 5    // minutes

const { version: currentVersion } = packageJson;

// State to track whether an update is available and the latest version.

const updateAvailable = vue.ref(false);
const latestVersion = vue.ref<string>('');

// Check if a new version is available.

interface IVersionInfo {
  version: string;
}

const checkForUpdates = async (): Promise<boolean> => {
  // Make sure that we are not running the desktop version of the editor.

  if (electronApi) {
    return false;
  }

  // Get the latest version information from the server and compare it with the current version.

  try {
    // Fetch the version.json file from the server with cache busting (i.e. by adding a timestamp query parameter to the
    // URL so that the browser doesn't serve a cached version).

    const response = await fetch(`./assets/version.json?t=${Date.now()}`);

    if (!response.ok) {
      console.warn('Failed to fetch the version information.');

      updateAvailable.value = false;
      latestVersion.value = '';

      return false;
    }

    const versionInfo: IVersionInfo = await response.json();

    latestVersion.value = versionInfo.version;

    // Compare versions.

    const isNewer = isNewerVersion(latestVersion.value, currentVersion);

    updateAvailable.value = isNewer;

    return isNewer;
  } catch (_error: unknown) {
    updateAvailable.value = false;
    latestVersion.value = '';

    return false;
  }
};

// Return whether the first version is newer than the second version.

const isNewerVersion = (versionA: string, versionB: string): boolean => {
  const partsA = versionA.split('.').map(Number);
  const partsB = versionB.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); ++i) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA > partB) {
      return true;
    }

    if (partA < partB) {
      return false;
    }
  }

  return false;
};

// Start periodic version checking (every 5 minutes).

let checkInterval: number | null = null;

const startCheck = (): void => {
  // Make sure that we are not running the desktop version of the editor.

  if (electronApi) {
    return;
  }

  // Check immediately on start.

  checkForUpdates();

  // Then check every 5 minutes.

  if (!checkInterval) {
    checkInterval = window.setInterval(
      () => {
        checkForUpdates();
      },
      60 * 1000 * VERSION_CHECK_INTERVAL
    );
  }
};

// Reload the Web app to get the latest version (force cache bypass).

const reloadApp = (): void => {
  window.location.replace(window.location.href);
};

// Export the version checking functions and state.

export { currentVersion, latestVersion, reloadApp, startCheck, updateAvailable };
