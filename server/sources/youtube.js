'use strict';

var util = require('util');
var urlParser = require('url');
var Track = require('../track');
var logger = require('../logger');
var Q = require('q');
var unirest = require('unirest');
var config = require('../config');
var ytdl = require('ytdl-core');
var Transcoder = require('stream-transcoder');
var format = require('../config').format;
var Throttle = require('throttle');

module.exports = {
  Track: YoutubeTrack,
  detectOnInput: detectOnInput,
  resolve: resolve
};

/**
 * Youtube Track
 */
function YoutubeTrack(track) {
  if (track.platform) this._initFromInternal.apply(this, arguments);
  else this._initFromExternal.apply(this, arguments);
}
util.inherits(YoutubeTrack, Track);

/**
 * Plays the sound of a Youtube video.
 * It streams the content, removes the video
 * and encode the sound into mp3.
 * Emits `progress` events.
 *
 * /!\ Resuming a video is (currently?) not possible.
 * When using the `range` option Youtube just returns a chunk a data
 * which is not recognized as a valid video.
 * cf. https://github.com/fent/node-ytdl/issues/32
 */
YoutubeTrack.prototype.play = function play() {
  var totalLength;
  var currentLength = 0;

  var ytOpts = {
    quality: 'highest',
    // filter: function(format) { return format.container === 'mp4'; }
  };
  console.log(this, '<- this')
  if (this.position) ytOpts.range = this.position + '-';

  var ytStream = ytdl(this.streamUrl, ytOpts);
  ytStream
    .on('info', function(_, format) {
      totalLength = parseInt(format.size, 10);
    })
    .on('data', function(chunk) {
      currentLength += chunk.length;
      this.emit('progress', {
        current: currentLength,
        total: totalLength
      });
    }.bind(this))
    .on('error', function() {
      ytStream.push(null);
    })
    .on('end', function() {
      this.end();
    });

  return new Transcoder(ytStream)
    // .custom('vn') // no video
    .audioCodec('libmp3lame')
    .sampleRate(format.sampleRate)
    .channels(format.channels)
    .audioBitrate(format.bitRate)
    .format('mp3')
    .stream()
    .pipe(new Throttle(format.bitRate / 8)); // throttle at 128kbps
};

/**
 * Detects if the input match this source.
 */
function detectOnInput(input) {
  var url = urlParser.parse(input, true, true);

  if (!url.hostname) return false;
  return (url.hostname.indexOf('youtube.com') > -1);
}

/**
 * Fetches the full track object from the Youtube API.
 * Returns a Promise resolving to a YoutubeTrack.
 */
function resolve(trackUrl) {
  logger.log(trackUrl, 'hee')
  var deferred = Q.defer();
  var url = urlParser.parse(trackUrl, true, true);

  unirest.get('https://www.googleapis.com/youtube/v3/videos')
    .query({
      id: url.query.v,
      key: config.youtube.clientId,
      alt: 'json',
      part: 'snippet'
    })
    .end(function(response) {
      logger.log(response.body.items);
      if (response.error) return deferred.reject(response.error);
      var track = response.body.entry;
      track.bitrate = 128 * 1000;
      deferred.resolve(new YoutubeTrack(track));
    });

  return deferred.promise;
}

/**
 * Private helpers
 */
YoutubeTrack.prototype._initFromExternal = function(track) {
  this.title = track.title.$t;
  if (track.author && track.author[0]) {
    this.artist = track.author[0].name.$t;
  }
  this.duration = track.media$group.yt$duration.seconds * 1000;
  this.url = track.link[0].href;
  this.streamUrl = track.link[0].href;
  this.cover = track.media$group.media$thumbnail[1].url;
  this.createdAt = new Date();
  this.platform = 'youtube';
};

YoutubeTrack.prototype._initFromInternal = function() {
  YoutubeTrack.super_.apply(this, arguments);
};