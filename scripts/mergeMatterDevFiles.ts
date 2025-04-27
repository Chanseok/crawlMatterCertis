import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define interfaces based on the expected structures
interface AllDevice {
  id: string;
  manufacturer: string;
  model: string;
  deviceType: string;
  certificationId: string;
  certificationDate: string;
  // ... other properties from all_matter_devices.json
  [key: string]: any;
}

interface UrlDevice {
  url: string;
  manufacturer: string;
  model: string;
  certificateId: string;
  pageId: number;
  indexInPage: number;
  [key: string]: any;
}

interface MergedDevice {
  url: string;
  pageId: number;
  indexInPage: number;
  id: string;
  manufacturer: string;
  model: string;
  deviceType: string;
  certificationId: string;
  certificationDate: string;
  // ... other properties from AllDevice
  [key: string]: any;
}

// --- Helper Functions ---

// Function to load JSON data from a file
function loadJSON<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found at ${filePath}`);
      process.exit(1);
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading or parsing JSON from ${filePath}:`, error);
    process.exit(1);
  }
}

// Function to group items by a key field
function groupItemsByKey<T>(items: T[], keyField: keyof T): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item[keyField] as string;
    if (!key) continue; // Skip items without the key field
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }
  return groups;
}

// --- Main Logic ---

async function mergeDeviceData() {
  console.log('Starting data merge process...');

  // Get absolute paths
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dataDir = path.resolve(__dirname, '../data-for-dev');
  const allDevicesPath = path.join(dataDir, 'all_matter_devices.json');
  const urlDevicesPath = path.join(dataDir, 'merged_devices.json');
  const outputPath = path.join(dataDir, 'merged_matter_devices.json');

  // Load data
  const allDevices: AllDevice[] = loadJSON<AllDevice>(allDevicesPath);
  const urlDevices: UrlDevice[] = loadJSON<UrlDevice>(urlDevicesPath);

  console.log(`Loaded ${allDevices.length} devices from all_matter_devices.json`);
  console.log(`Loaded ${urlDevices.length} URL entries from merged_devices.json`);

  if (allDevices.length === 0 || urlDevices.length === 0) {
    console.error('One or both input files are empty or failed to load. Exiting.');
    return;
  }

  // Group devices by certificationId for efficient lookup and duplicate handling
  const allDevicesGrouped = groupItemsByKey(allDevices, 'certificationId');
  const urlDevicesGrouped = groupItemsByKey(urlDevices, 'certificateId');

  // Check for duplicate counts mismatch (as per requirement, they should match)
  let duplicateMismatch = false;
  for (const [certId, group] of allDevicesGrouped.entries()) {
    if (group.length > 1) {
      const urlGroup = urlDevicesGrouped.get(certId);
      if (!urlGroup || urlGroup.length !== group.length) {
        console.warn(`Mismatch in duplicate count for certificationId: ${certId}. Devices: ${group.length}, URLs: ${urlGroup ? urlGroup.length : 0}`);
        // Decide how to handle this - for now, we'll proceed but log the warning.
        // duplicateMismatch = true; // Uncomment to stop on mismatch
      }
    }
  }
  // if (duplicateMismatch) { // Uncomment to stop on mismatch
  //   console.error("Stopping due to duplicate count mismatch.");
  //   return;
  // }

  // Sort the URL devices based on pageId and indexInPage
  urlDevices.sort((a, b) => {
    if (a.pageId !== b.pageId) {
      return a.pageId - b.pageId;
    }
    return a.indexInPage - b.indexInPage;
  });

  const finalMergedDevices: MergedDevice[] = [];
  const processedAllDeviceIndices = new Set<number>(); // Keep track of used indices in allDevices for duplicates
  const duplicateCounters = new Map<string, number>(); // Track usage count for duplicate cert IDs

  // Iterate through the sorted URL devices to maintain the desired order
  for (const urlDevice of urlDevices) {
    const certId = urlDevice.certificateId;
    if (!certId) {
      console.warn(`Skipping URL entry with missing certificateId: ${JSON.stringify(urlDevice)}`);
      continue;
    }

    const matchingDevices = allDevicesGrouped.get(certId);

    if (!matchingDevices || matchingDevices.length === 0) {
      console.warn(`No matching device found in all_matter_devices.json for certificateId: ${certId} from URL device: ${urlDevice.url}`);
      continue; // Skip if no match found
    }

    const duplicateIndex = duplicateCounters.get(certId) || 0;

    if (duplicateIndex >= matchingDevices.length) {
      // This condition indicates more urlDevice entries exist for a certId
      // than allDevice entries. This shouldn't happen based on the requirements
      // but log it if it does.
      console.warn(`More URL entries than device entries for duplicate certificateId: ${certId}. Skipping extra URL entry: ${urlDevice.url}`);
      continue;
    }

    // Get the specific device based on the duplicate counter
    const deviceToMerge = { ...matchingDevices[duplicateIndex] }; // Create a copy

    // Check if this certificateId corresponds to a duplicate group in all_matter_devices.json
    const isDuplicate = matchingDevices.length > 1;

    // If it's part of a duplicate group, append '-to-be-checked' to the id
    if (isDuplicate) {
      deviceToMerge.id = `${deviceToMerge.id}-to-be-checked`;
    }

    // Create the merged object with specified order
    const mergedDevice: MergedDevice = {
      url: urlDevice.url,
      pageId: urlDevice.pageId,
      indexInPage: urlDevice.indexInPage,
      ...deviceToMerge, // Spread the rest of the properties from allDevices
      // Ensure certificationId from allDevices is used if it differs from urlDevice's certificateId (though they should match)
      certificationId: deviceToMerge.certificationId,
    };
    // Remove the potentially conflicting certificateId from the spread object if necessary
    delete (mergedDevice as any).certificateId;

    finalMergedDevices.push(mergedDevice);

    // Increment the counter for this certificateId
    duplicateCounters.set(certId, duplicateIndex + 1);
  }

  // Add a final check to see if the count matches the sorted urlDevices length
  if (finalMergedDevices.length !== urlDevices.length) {
    console.warn(`Potential mismatch: Started with ${urlDevices.length} URL devices, but merged ${finalMergedDevices.length} devices.`);
    // You might want to add more detailed logging here to find which specific urlDevice was missed.
  }

  // Write the final merged and sorted data
  fs.writeFileSync(outputPath, JSON.stringify(finalMergedDevices, null, 2));
  console.log(`Successfully merged ${finalMergedDevices.length} devices into ${outputPath}`);
}

// Run the main function
mergeDeviceData();