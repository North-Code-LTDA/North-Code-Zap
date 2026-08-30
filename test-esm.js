import { InstanceManager } from './dist/server.js';
console.log('Successfully imported InstanceManager');

// We can just verify if InstanceManager exists or can be constructed.
const instanceManager = new InstanceManager();
instanceManager.reloadWorkspaceFromDisk('dummy-uuid').then(() => {
    console.log('reloadWorkspaceFromDisk completed successfully!');
}).catch(err => {
    console.error('Error during reloadWorkspaceFromDisk:', err);
    process.exit(1);
});
