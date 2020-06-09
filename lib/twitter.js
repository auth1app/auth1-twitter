'use strict';

/**
 * Module dependencies
 */

var url = require('url');
var Streamparser = require('./parser');
var request = require('request');
var extend = require('deep-extend');

// Package version
var VERSION = require('../package.json').version;

function Twitter(options) {
  if (!(this instanceof Twitter)) { return new Twitter(options) }

  this.VERSION = VERSION;

  // Merge the default options with the client submitted options
  this.options = extend({
    consumer_key: null,
    consumer_secret: null,
    access_token_key: null,
    access_token_secret: null,
    bearer_token: null,
    client_id: null,
    client_secret: null,
    // auth1_token_rest_base: 'https://auth.owenyoung.com/api/v1',
    auth1_token_rest_base: 'http://localhost:7070/api/v1',

    rest_base: 'https://api.twitter.com/1.1',
    stream_base: 'https://stream.twitter.com/1.1',
    user_stream_base: 'https://userstream.twitter.com/1.1',
    site_stream_base: 'https://sitestream.twitter.com/1.1',
    media_base: 'https://upload.twitter.com/1.1',
    request_options: {
      headers: {
        Accept: '*/*',
        Connection: 'close',
        'User-Agent': 'node-twitter/' + VERSION
      }
    }
  }, options);



  // get bearer_token, if client_id client secret
  if(this.options.client_id && this.options.client_secret){

    this.authentication_options = null;
    this.jwt = true;
    this.jwtTokenExpiresAt = 0;
  }
  else{
      // Default to user authentication
    this.authentication_options = {
      oauth: {
        consumer_key: this.options.consumer_key,
        consumer_secret: this.options.consumer_secret,
        token: this.options.access_token_key,
        token_secret: this.options.access_token_secret
      }
    };
  // Check to see if we are going to use User Authentication or Application Authetication
    if (this.options.bearer_token) {
      this.authentication_options = {
        headers: {
          Authorization: 'Bearer ' + this.options.bearer_token
        }
      };
    }

  }

  var _this = this;

  // Configure default request options
  this.request = function(options,cb,cbRequest){
    if(_this.jwt === true){
      // check expire
      
      if((_this.jwtTokenExpiresAt-60*1000)<Date.now()){
        // expired
        request.post(_this.options.auth1_token_rest_base+'/oauth/token',{
          body:{
            'client_id': 'c6DLBNy42duYrmGJ2bAxL',
            'client_secret': 'K25JMjUxVnBjdGJLMEZOYVpJeEFmQ3Z0Y2pNeEZkc1YzL2grUXgvVmwxMm00WnR2QngxUnlwbnhiWkJ0UFo1aXB6K1ZpSk1Lb3Y2VmlOSkxxV0VhWkE9PQ',
            'grant_type': 'client_credentials'
          },
          json:true
        },function(err,_res,body){
          if(err){
            cb(err);
            return;
          }
          
          if(body.status === 'success'){
            _this.jwtToken = body.data.access_token;
            _this.jwtTokenExpiresAt = body.data.expires_at*1000;
            


            var r = (request.defaults(
              extend(
                _this.options.request_options,
                {
                  headers: {
                    Authorization: 'Bearer ' + _this.jwtToken
                  }
                }
              )
            )(options,cb));
            cbRequest && cbRequest(r);
            return;
          }
          cb(body);
          return;
          
          
       
          
          
        });
      }
      else{
        var r = (request.defaults(
          extend(
            _this.options.request_options,
            {
              headers: {
                Authorization: 'Bearer ' + this.options.jwtToken
              }
            }
          )
        )(options,cb));
        cbRequest && cbRequest(r);
      }
    }
    else{
      var requestResult = request.defaults(
        extend(
          _this.options.request_options,
          _this.authentication_options!==null?this.authentication_options:{}
        )
      )(options,cb);
      cbRequest && cbRequest(requestResult);
    }
    
  };
  
 

  // Check if Promise present
  this.allow_promise = (typeof Promise === 'function');
}

Twitter.prototype.__buildEndpoint = function(path, base) {
  var bases = {
    'rest': this.options.rest_base,
    'stream': this.options.stream_base,
    'user_stream': this.options.user_stream_base,
    'site_stream': this.options.site_stream_base,
    'media': this.options.media_base
  };
  var endpoint = (bases.hasOwnProperty(base)) ? bases[base] : bases.rest;
  // if full url is specified we use that
  var isFullUrl = (url.parse(path).protocol !== null);
  if (isFullUrl) {
    endpoint = path;
  }
  else {
    // If the path begins with media or /media
    if (path.match(/^(\/)?media/)) {
      endpoint = bases.media;
    }
    endpoint += (path.charAt(0) === '/') ? path : '/' + path;
  }

  // Remove trailing slash
  endpoint = endpoint.replace(/\/$/, '');

  if(!isFullUrl) {
    // Add json extension if not provided in call... only if a full url is not specified
    endpoint += (path.split('.').pop() !== 'json') ? '.json' : '';
  }

  return endpoint;
};

Twitter.prototype.__request = function(method, path, params, callback) {
  var base = 'rest', promise = false;

  // Set the callback if no params are passed
  if (typeof params === 'function') {
    callback = params;
    params = {};
  }
  // Return promise if no callback is passed and promises available
  else if (callback === undefined && this.allow_promise) {
    promise = true;
  }

  // Set API base
  if (typeof params.base !== 'undefined') {
    base = params.base;
    delete params.base;
  }

  // Build the options to pass to our custom request object
  var options = {
    method: method.toLowerCase(),  // Request method - get || post
    url: this.__buildEndpoint(path, base) // Generate url
  };

  // Pass url parameters if get
  if (method === 'get') {
    options.qs = params;
  }

  // Pass form data if post
  if (method === 'post') {
    var formKey = 'form';

    if (typeof params.media !== 'undefined') {
      formKey = 'formData';
    }
    options[formKey] = params;
  }

  // Promisified version
  if (promise) {
    var _this = this;
    return new Promise(function(resolve, reject) {
    
      _this.request(options, function(error, response, data) {
        // request error
        if (error) {
          return reject(error);
        }

        // JSON parse error or empty strings
        try {
          // An empty string is a valid response
          if (data === '') {
            data = {};
          }
          else {
            data = JSON.parse(data);
          }
        }
        catch(parseError) {
          return reject(new Error('JSON parseError with HTTP Status: ' + response.statusCode + ' ' + response.statusMessage));
        }

        // response object errors
        // This should return an error object not an array of errors
        if (data.errors !== undefined) {
          return reject(data.errors);
        }

        // status code errors
        if(response.statusCode < 200 || response.statusCode > 299) {
          return reject(new Error('HTTP Error: ' + response.statusCode + ' ' + response.statusMessage));
        }

        // no errors
        resolve(data);
      });
    });
  }

  // Callback version
  this.request(options, function(error, response, data) {
    // request error
    if (error) {
      return callback(error, data, response);
    }

    // JSON parse error or empty strings
    try {
      // An empty string is a valid response
      if (data === '') {
        data = {};
      }
      else {
        data = JSON.parse(data);
      }
    }
    catch(parseError) {
      return callback(
        new Error('JSON parseError with HTTP Status: ' + response.statusCode + ' ' + response.statusMessage),
        data,
        response
      );
    }


    // response object errors
    // This should return an error object not an array of errors
    if (data.errors !== undefined) {
      return callback(data.errors, data, response);
    }

    // status code errors
    if(response.statusCode < 200 || response.statusCode > 299) {
      return callback(
        new Error('HTTP Error: ' + response.statusCode + ' ' + response.statusMessage),
        data,
        response
      );
    }
    // no errors
    callback(null, data, response);
  });

};

/**
 * GET
 */
Twitter.prototype.get = function(url, params, callback) {
  return this.__request('get', url, params, callback);
};

/**
 * POST
 */
Twitter.prototype.post = function(url, params, callback) {
  return this.__request('post', url, params, callback);
};

/**
 * STREAM
 */
Twitter.prototype.stream = function(method, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = {};
  }

  var base = 'stream'; 
  var _callbacks = [];

  if (method === 'user' || method === 'site') {
    base = method + '_' + base;
  }

  var url = this.__buildEndpoint(method, base);
  var stream = new Streamparser();

  this.request({url: url, qs: params},null,function(request){
    if(_callbacks.length>0){
      _callbacks.forEach(function(callback){
        callback(request);
      });
      _callbacks = [];
    } 
    request.on('response', function(response) {
      if(response.statusCode !== 200) {
        stream.emit('error', new Error('Status Code: ' + response.statusCode));
      }
      else {
        stream.emit('response', response);
      }
  
      response.on('data', function(chunk) {
        stream.receive(chunk);
      });
  
      response.on('error', function(error) {
        stream.emit('error', error);
      });
  
      response.on('end', function() {
        stream.emit('end', response);
      });
    });
  
    request.on('error', function(error) {
      stream.emit('error', error);
    });
    request.end();
  });

  stream.destroy = function() {
    _callbacks.push(function(request){
    // FIXME: should we emit end/close on explicit destroy?
      if ( typeof request.abort === 'function' ) {
        request.abort(); // node v0.4.0
      }
      else {
        request.socket.destroy();
      }
    });

  };

  if (typeof callback === 'function') {
    callback(stream);
  }
  else {
    return stream;
  }
};


module.exports = Twitter;
