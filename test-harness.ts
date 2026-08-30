import { InstanceManager } from './server/instances.ts';
const manager = new InstanceManager();
manager.reloadWorkspaceFromDisk('00000000-0000-0000-0000-000000000000')
  .then(() => console.log('Successfully completed reloadWorkspaceFromDisk in ESM!'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
