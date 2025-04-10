import { expect, test } from '@playwright/test';

// Configure test retry logic for potentially flaky network/UI interactions
test.describe.configure({ retries: 1 });

/**
 * End-to-End test for the Connect app's core functionality:
 * 1. Creating a new drive
 * 2. Creating a folder within that drive
 * 3. Creating a document within that folder
 */
test.describe('Connect App Core Flow', () => {
  const TEST_DRIVE_NAME = 'test drive';
  const TEST_FOLDER_NAME = 'test folder';
  const TEST_DOCUMENT_NAME = 'test document';
  
  test('should create a drive, folder, and document', async ({ page }) => {
    // Take screenshots on test failure for easier debugging
    test.info().annotations.push({
      type: 'testrail',
      description: 'Core functionality flow test'
    });
    
    try {
      // 1. NAVIGATE TO APPLICATION
      console.log('Navigating to Connect app...');
      await page.goto('http://localhost:3001/');
      
      // 2. HANDLE COOKIE CONSENT
      await page.waitForSelector('text=This website uses cookies', { 
        timeout: 30000, 
        state: 'visible' 
      });
      console.log('Cookie banner found');
      
      await page.getByRole('button', { name: 'Accept configured cookies' }).click();
      console.log('Cookies accepted');
      
      // 3. CREATE A NEW DRIVE
      await page.waitForSelector('text=Create New Drive', { 
        timeout: 30000, 
        state: 'visible' 
      });
      console.log('Create New Drive button found');
      
      await page.getByText('Create New Drive', { exact: true }).click();
      console.log('Create New Drive button clicked');
      
      await page.waitForSelector('text=Create Drive', { 
        timeout: 10000,
        state: 'visible'
      });
      console.log('Create Drive modal opened');
      
      // Fill drive name with robust selector and wait
      const driveNameInput = page.locator('input[placeholder="Drive name"]');
      await driveNameInput.waitFor({ state: 'visible' });
      await driveNameInput.fill(TEST_DRIVE_NAME);
      console.log('Drive name entered');
      
      // Click create with explicit waitFor
      const createDriveButton = page.getByRole('button', { name: 'Create new drive' });
      await createDriveButton.waitFor({ state: 'visible' });
      await createDriveButton.click();
      console.log('Create new drive button clicked');
      
      // Wait for drive to appear in UI
      await page.waitForSelector(`text=${TEST_DRIVE_NAME}`, { 
        timeout: 10000,
        state: 'visible'
      });
      console.log('Drive created successfully');
      
      // Wait for the page to fully load and stabilize after drive creation
      console.log('Waiting for drive page to fully load...');
      await page.waitForTimeout(5000);
      
      // 4. CREATE A FOLDER
      // Find and interact with the "Add new" element in the breadcrumb
      const addNewElement = page.getByText('Add new', { exact: true });
      await addNewElement.waitFor({ state: 'visible', timeout: 10000 });
      console.log('Found "Add new" in the breadcrumb');
      
      await addNewElement.click();
      console.log('Clicked on "Add new" to transform it into input field');
      
      // Brief wait for animation/focus to complete
      await page.waitForTimeout(500);
      
      // Type folder name and press Enter
      await page.keyboard.type(TEST_FOLDER_NAME);
      console.log(`Entered folder name: ${TEST_FOLDER_NAME}`);
      
      await page.keyboard.press('Enter');
      console.log('Pressed Enter to create folder');
      
      // Wait for folder to appear with explicit state check
      await page.waitForSelector(`text=${TEST_FOLDER_NAME}`, { 
        timeout: 10000,
        state: 'visible' 
      });
      console.log('Folder created and visible');
      
      // 5. NAVIGATE INTO FOLDER AND CREATE DOCUMENT
      // Click on the folder with more specific selector
      await page.getByText(TEST_FOLDER_NAME, { exact: true }).click();
      console.log('Navigated to folder');
      
      // Wait for the "New document" section with explicit state
      await page.waitForSelector('text=New document', { 
        timeout: 10000,
        state: 'visible'
      });
      
      // Click DocumentModel button with explicit wait
      const documentModelButton = page.getByText('DocumentModel', { exact: true });
      await documentModelButton.waitFor({ state: 'visible' });
      await documentModelButton.click();
      console.log('DocumentModel button clicked');
      
      // Wait for document creation dialog
      await page.waitForSelector('text=Create a new document', { 
        timeout: 10000,
        state: 'visible'
      });
      
      // Enter document name with better error handling
      const documentNameInput = page.locator('input[placeholder="Document name"]');
      await documentNameInput.waitFor({ state: 'visible' });
      await documentNameInput.fill(TEST_DOCUMENT_NAME);
      console.log(`Entered document name: ${TEST_DOCUMENT_NAME}`);
      
      // Click Create button with explicit wait
      const createDocButton = page.getByRole('button', { name: 'Create', exact: true });
      await createDocButton.waitFor({ state: 'visible' });
      await createDocButton.click();
      console.log('Document created');
      
      // Wait for document editor to load
      await page.waitForSelector(`text=${TEST_DOCUMENT_NAME}`, { 
        timeout: 15000,
        state: 'visible'
      });
      
      // Final verification
      await expect(page.locator(`text=${TEST_DOCUMENT_NAME}`)).toBeVisible();
      console.log('Successfully created drive, folder and document!');
      
      // Take a screenshot of the successful result
      await page.screenshot({ path: 'test-success.png' });
      
      // OPTIONAL: CLEANUP RIGHT IN THE TEST
      // Since we can't use afterAll with page fixture, we'll do cleanup here
      // This is optional - you might want to keep test content for debugging
      if (process.env.CLEANUP_AFTER_TEST === 'true') {
        console.log('Performing test cleanup...');
        
        // Navigate back to home
        await page.goto('http://localhost:3001/');
        await page.waitForTimeout(2000);
        
        // Find test drive and try to delete it 
        // This would require implementing the specific deletion flow
        // based on your application's UI
        
        console.log('Cleanup complete');
      }
    
    } catch (error) {
      // Take screenshot on failure for debugging
      await page.screenshot({ path: `test-failure-${Date.now()}.png` });
      console.error('Test failed:', error);
      throw error;
    }
  });
}); 