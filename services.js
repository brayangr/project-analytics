
const request = require('request');
const TOKEN = process.env.CLUBHOUSE_API_TOKEN;

const buildRequest = url => {
  return {
    url,
    headers: {
      'Content-Type': 'application/json',
      'Shortcut-Token': TOKEN
    }
  }
}

exports.fetchGroups = async callback => {
  const requestOptions = buildRequest('https://api.app.shortcut.com/api/v3/groups');
  request(requestOptions, callback);
}

exports.fetchGroupStories = async (groupId, callback) => {
  const requestOptions = buildRequest(`https://api.app.shortcut.com/api/v3/groups/${groupId}/stories`);
  request(requestOptions, callback);
}

exports.fetchProjects = callback => {
  const requestOptions = buildRequest('https://api.app.shortcut.com/api/v3/projects');
  request(requestOptions, callback);
}
