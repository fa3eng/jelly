import { createServer } from 'node:http';

const token = process.env.JELLY_SERVER_TOKEN;
const allowedOrigin = process.env.JELLY_ALLOWED_ORIGIN;
const port = Number(process.env.JELLY_SERVER_PORT);

createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (request.url === '/health/ready') {
    if (request.headers.origin !== allowedOrigin) {
      response.writeHead(403).end();
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ready' }));
    return;
  }

  response.writeHead(404).end();
}).listen(port, '127.0.0.1');
