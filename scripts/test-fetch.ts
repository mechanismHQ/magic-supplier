import { fetch } from 'cross-fetch';
import axios from 'axios';

async function run() {
  const res = await fetch('http://0.0.0.0:9999');
  // const res = await axios.get('http://0.0.0.0:9999/api/queues');
  console.log(res.status);
}

run()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
