'use strict';

var redis = require('redis');
var url = require('url');

function _newRedisClient(port, host) {
  var client;

  if (process.env.REDIS_URL) {
    var rtg = url.parse(process.env.REDIS_URL)
    client = redis.createClient(rtg.port, rtg.hostname)

    client.auth(rtg.auth.split(':')[1])
  } else {
    client = redis.createClient(port, host)
  }

  client.once('ready', function() {
    console.log('Redis is connected');
  });

  client.on('error', function(err) {
    console.log('Redis error:', err);
  });

  client.on('reconnecting', function() {
    console.log('Redis is reconnecting');
  });

  client.once('end', function() {
    console.log('Redis connection terminated');
  });

  return client;
}

module.exports = {
  client: _newRedisClient(),
  sub: _newRedisClient()
};