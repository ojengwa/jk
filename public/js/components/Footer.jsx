'use strict';

var React = require('react/addons');
var bookmarklet = require('../utils/bookmarklet');

module.exports = React.createClass({
  render: function () {
    return (
      <div className="row ">
        <div className="col-xs-12">
          <div className="mastfoot">
            <div className="inner">
              <p>
                <a className="boxed" href={bookmarklet()}>+ Add</a>
                Drag and drop this to your bookmarks to easily add new tracks.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
});
