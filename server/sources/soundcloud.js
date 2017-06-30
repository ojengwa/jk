'use strict';

var util = require('util');
var urlParser = require('url');
var https = require('https');
var Throttle = require('throttle');
var Track = require('../track');
var logger = require('../logger');
var Q = require('q');
var unirest = require('unirest');
var config = require('../config');
var url = require('url');
var regexRange = new RegExp(/bytes (\d+)-(\d+)\/(\d+)/);

module.exports = {
  Track: SoundcloudTrack,
  detectOnInput: detectOnInput,
  resolve: resolve
};

/**
 * Soundcloud Track
 */
function SoundcloudTrack(track) {
  if (track.platform) this._initFromInternal.apply(this, arguments);
  else this._initFromExternal.apply(this, arguments);
}
util.inherits(SoundcloudTrack, Track);

/**
 * Returns an mp3 stream from Soundcloud.
 */
SoundcloudTrack.prototype.play = function play() {
  return this._download(this.streamUrl, this.position);
};

/**
 * Detects if the input match this source.
 */
function detectOnInput(input) {
  var url = urlParser.parse(input, true, true);
  if (!url.hostname) return false;
  return (url.hostname.indexOf('soundcloud.com') > -1);
}

/**
 * Fetches the full track object from the Soundcloud API.
 * Returns a Promise resolving to a SoundcloudTrack.
 */
function resolve(trackUrl) {
  var deferred = Q.defer();

  unirest.get('https://api.soundcloud.com/resolve.json')
    .query({
      client_id: config.soundcloud.clientId,
      url: trackUrl
    })
    .end(function(response) {
      logger.log(response.body.items);
      if (response.error) return deferred.reject(response.error);
      if (response.body.kind === 'track') {
        var track = response.body;
        // Better image resolution
        track.artwork_url = track.artwork_url.replace('large.jpg', 't300x300.jpg');
        track.bitrate = 128 * 1000;
        deferred.resolve(new SoundcloudTrack(track));
      } else if (response.body.kind === 'playlist') {
        var tracks = response.body.tracks.map(function(tr) {
          // Better image resolution
          tr.artwork_url = tr.artwork_url.replace('large.jpg', 't300x300.jpg');
          tr.bitrate = 128 * 1000;
          return new SoundcloudTrack(tr);
        });

        deferred.resolve(tracks);
      } else {
        deferred.reject('This is not a track.');
      }
    });

  return deferred.promise;
}

/**
 * Private helpers
 */
SoundcloudTrack.prototype._initFromExternal = function(track) {
  this.title = track.title;
  this.artist = track.user.username;
  this.duration = track.duration;
  this.url = track.permalink_url;
  this.streamUrl = track.stream_url;
  this.cover = track.artwork_url;
  this.createdAt = new Date();
  this.platform = 'soundcloud';
};

SoundcloudTrack.prototype._initFromInternal = function() {
  SoundcloudTrack.super_.apply(this, arguments);
};

/**
 * Returns a stream with the mp3 data from Soundcloud.
 * Also performs recurrently to follow redirections.
 * Emits `progress` events.
 */
SoundcloudTrack.prototype._download = function(streamUrl, position) {
  // do not add the clientId after a redirection
  if (streamUrl.indexOf('Key-Pair-Id') < 0) {
    streamUrl += '?client_id=' + config.soundcloud.clientId;
  }
  var parsedUrl = url.parse(streamUrl);
  var options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.path,
    headers: {}
  };

  if (position) {
    options.headers.Range = ['bytes=', position, '-'].join('');
  } else {
    options.headers.Range = 'bytes=0-';
  }

  var output = new Throttle(1.05 * 128 * 1000 / 8); // throttle at 128kbps

  https.get(options, function(res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return this._download(res.headers.location, position).pipe(output);
    } else if (res.statusCode >= 400) {
      // 404 or whatever, we skip
      output.end();
      return;
    }

    // Content-Range: bytes 20962036-61451700/61451701
    var totalLength, currentLength;
    if (res.headers['content-range']) {
      var splits = regexRange.exec(res.headers['content-range']);
      totalLength = parseInt(splits[3], 10);
      currentLength = parseInt(splits[1], 10);
    } else {
      totalLength = res.headers['content-length'];
      currentLength = 0;
    }

    this.emit('progress', {
      current: currentLength,
      total: totalLength
    });

    res.on('data', function(chunk) {
      currentLength += chunk.length;
      this.emit('progress', {
        current: currentLength,
        total: totalLength
      });
    }.bind(this)).pipe(output);

  }.bind(this)).end();

  return output;
};