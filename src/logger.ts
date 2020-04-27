import * as winston from 'winston';

const level2severity = {
  emerg: 'EMERGENCY',
  alert: 'ALERT',
  crit: 'CRITICAL',
  error: 'ERROR',
  warning: 'WARNING',
  notice: 'NOTICE',
  info: 'INFO',
  debug: 'DEBUG',
};

const severity = winston.format((info) => {
  return { ...info, severity: level2severity[info.level] };
});

const transports: any[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.ms(),
      severity(),
      process.env.NODE_ENV !== 'production'
        ? winston.format.simple()
        : winston.format.json(),
    ),
  }),
];

export const logger = winston.createLogger({
  transports,
  levels: winston.config.syslog.levels,
  level: 'debug',
});
