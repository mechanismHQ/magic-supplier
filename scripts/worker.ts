import { initWorkerThread } from '../src/worker';
import { stdout } from 'process';

stdout.write(String.fromCharCode(27) + ']0;' + 'SUPPLIER' + String.fromCharCode(7));

void initWorkerThread();
