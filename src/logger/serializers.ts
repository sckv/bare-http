import callsites from 'callsites';

import pJson from '../../package.json';
import { context } from '../context';

import util from 'util';
import type { IncomingMessage, ServerResponse } from 'http';

export function parseError(e: any, meta: any) {
  const toSend = { error: { ...e }, ...meta };
  toSend.message = e.message;
  if (e.stack) toSend.error.stack = e.stack;
  toSend.error.kind = e.constructor.name;
  return toSend;
}

const makeLoggerMetadata = (method: string | null) => ({
  name: 'pino',
  version: pJson.version,
  method_name: method,
});

export function serializeLog(...args) {
  const site = callsites()[2];
  const location = `${site.getFileName()}:${site.getLineNumber()}:${site.getColumnNumber()}`;
  const logger = makeLoggerMetadata(site.getFunctionName());
  const executionId = context.current?.store.get('id');

  const meta = { timestamp: Date.now(), location, logger, trace: executionId };

  if (!args.length) return { message: 'empty log', ...meta };
  if (args.length === 1) {
    if (typeof args[0] === 'string') return { message: args[0], ...meta };
    if (util.types.isNativeError(args[0])) return parseError(args[0], meta);
    return { ...args[0], ...meta };
  }

  if (typeof args[0] === 'string') return { message: args.shift(), args, ...meta };
  return { ...args, ...meta };
}

function apacheLogFormat(
  startDate: Date,
  remoteClient: string,
  content: number,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const isProxy = req.headers['x-forwarded-for'];
  return `${isProxy || req.socket.remoteAddress} ${
    remoteClient || '-'
  } ${startDate.toISOString()} "${req.method} ${req.url} HTTP/${req.httpVersionMajor}.${
    req.httpVersionMinor
  }" ${res.statusCode} ${content || '-'}`;
}

export function getStatusLevel(statusCode: number) {
  if (statusCode >= 400 && statusCode < 500) {
    return 'warn';
  } else if (statusCode >= 500) {
    return 'error';
  }
  return 'info';
}

export function serializeHttp(
  headers: { [k: string]: any },
  startDate: Date,
  remoteClient: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const executionId = context.current?.store.get('id');

  return {
    level: getStatusLevel(res.statusCode),
    logObject: {
      message: apacheLogFormat(startDate, remoteClient, headers['Content-Length'], req, res),
      timestamp: Date.now(),
      trace: executionId,
      request: {
        headers: req.headers,
        http_version: req.httpVersion,
        id: req.headers['x-request-id'] || 'unknown',
        method: req.method,
        url: req.url,
      },
      response: {
        status_code: res.statusCode,
        headers: headers,
      },
      duration: headers['X-Processing-Time'],
    },
  };
}