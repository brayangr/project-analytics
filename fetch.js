var fs = require('fs');

var _ = require('lodash');
var moment = require('moment');
const { GROUPING_TYPES } = require('./constants');
const services = require('./services');

var MILLISECONDS_IN_A_DAY = 1000 * 60 * 60 * 24;
var DATE_FORMAT = 'YYYY-MM-DD';
var PROJECT_FILE = 'data/projects.js';

var TOKEN = process.env.CLUBHOUSE_API_TOKEN;

function createDateRange(fromDate, toDate) {
  var stack = [];
  var fromMoment = moment(fromDate);
  var toMoment = moment(toDate);

  while (fromMoment.isBefore(toMoment) || fromMoment.isSame(toMoment, 'days')) {
    stack.push(fromMoment.format(DATE_FORMAT));
    fromMoment = fromMoment.add(1, 'days');
  }

  return stack;
}

function storiesToCompletedTimestamps(stories) {
  return _.map(stories, function (story) {
    return new Date(story.completed_at).getTime();
  });
}

function calculateDateRangeForStories(stories) {
  var timestamps = storiesToCompletedTimestamps(stories);
  var fromDate = _.min(timestamps);
  var toDate = _.max(timestamps);

  return createDateRange(fromDate, toDate);
}

function calculateStoryRatioData(stories, dateRange) {
  var data = 'Data.StoryTypeRatios = [\n';
  var totals = {
    feature: 0,
    bug: 0,
    chore: 0,
    total: 0
  };

  _.each(dateRange, function (day) {
    _.each(stories, function (story) {
      if (story.completed_at.split('T')[0] === day) {
        totals[story.story_type] += 1;
        totals.total += 1;
      }
    });
    data += '  [new Date("' + day + '"), ' + (totals.feature / totals.total) + ', ' + (totals.bug / totals.total) + ', ' + (totals.chore / totals.total) + '],\n';
  });

  data += '];\n';

  return data;
}

function calculateStoryTypeData(stories, dateRange) {
  var data = 'Data.StoryTypeData = [\n';
  var totals = {
    feature: 0,
    bug: 0,
    chore: 0
  };

  _.each(dateRange, function (day) {
    _.each(stories, function (story) {
      if (story.completed_at.split('T')[0] === day) {
        // Measure by story count:
        totals[story.story_type] += 1;

        // Measure by points:
        // if (story.estimate) {
        //   totals[story.story_type] += story.estimate;
        // }
      }
    });
    data += '  [new Date("' + day + '"), ' + totals.feature + ', ' + totals.bug + ', ' + totals.chore + '],\n';
  });

  data += '];\n';

  return data;
}

function calculateMonthlyVelocityChartData(stories, dateRange) {
  var data = 'Data.MonthlyVelocityChartByStoryCount = [\n';
  var velocity = 0;

  _.each(dateRange, function (day) {
    _.each(stories, function (story) {
      if (story.completed_at.split('T')[0] === day) {
        // Measure by story count:
        velocity += 1;

        // Measure by points:
        // if (story.estimate) {
        //   velocity += story.estimate;
        // }
      }
    });

    if (day.split('-')[2] === '01') {
      data += '  [new Date("' + day + '"), ' + velocity + '],\n';
      velocity = 0;
    }
  });

  data += '];\n';

  return data;
}

function calculateMonthlyVelocityChartByPointsData(stories, dateRange) {
  var data = 'Data.MonthlyVelocityChartByPoints = [\n';
  var velocity = 0;

  _.each(dateRange, function (day) {
    _.each(stories, function (story) {
      if (story.completed_at.split('T')[0] === day) {
        if (story.estimate) {
          velocity += story.estimate;
        }
      }
    });

    if (day.split('-')[2] === '01') {
      data += '  [new Date("' + day + '"), ' + velocity + '],\n';
      velocity = 0;
    }
  });

  data += '];\n';

  return data;
}

function calculateCycleTimeChartData(stories, dateRange) {
  var data = 'Data.CycleTimeChart = [\n';
  var cycleTimes = [];

  _.each(dateRange, function (day) {
    _.each(stories, function (story) {
      if (story.completed_at.split('T')[0] === day) {
        var cycleTime = (new Date(story.completed_at).getTime() - new Date(story.started_at).getTime()) / MILLISECONDS_IN_A_DAY;

        cycleTimes.push(cycleTime);
      }
    });

    if (day.split('-')[2] === '01') {
      data += '  [new Date("' + day + '"), ' + _.max(cycleTimes) + ', ' + _.mean(cycleTimes) + ', ' + _.min(cycleTimes) + '],\n';
      cycleTimes = [];
    }
  });

  data += '];\n';

  return data;
}

function calculateEstimateChartData(stories) {
  var estimates = { None: 0 };

  _.each(stories, function (story) {
    var estimate = _.isNumber(story.estimate) ? story.estimate : 'None';

    if (estimates[estimate]) {
      estimates[estimate]++;
    } else {
      estimates[estimate] = 1;
    }
  });

  var data = 'Data.EstimateChart = ' + JSON.stringify(estimates) + ';\n';

  return data;
}

function compileChartData(stories, project) {
  console.log('Compiling story data...');
  stories = _.sortBy(stories, function (story) {
    return new Date(story.completed_at).getTime();
  });

  var dateRange = calculateDateRangeForStories(stories);

  var data = 'var Data = {}; Data.ProjectName = "' + project.name + '"; Data.LastFetched="' + moment().format('MMMM D, YYYY') + '"; ';
  data += calculateStoryTypeData(stories, dateRange);
  data += calculateStoryRatioData(stories, dateRange);
  data += calculateMonthlyVelocityChartData(stories, dateRange);
  data += calculateMonthlyVelocityChartByPointsData(stories, dateRange);
  data += calculateCycleTimeChartData(stories, dateRange);
  data += calculateEstimateChartData(stories);

  fs.writeFileSync(`data/project-${project.id}.js`, data);
}

function saveProjectsToFile(projects) {
  var data = 'var ClubhouseProjects = [];';
  _.each(_.filter(projects, { archived: false }), function (project) {
    data += 'ClubhouseProjects.push({ id: ' + project.id + ', name: "' + project.name + '" });';
  });
  _.each(_.filter(projects, { archived: true }), function (project) {
    data += 'ClubhouseProjects.push({ id: ' + project.id + ', name: "' + project.name + ' (archived)" });';
  });
  fs.writeFileSync(PROJECT_FILE, data);
}

const saveGroupsToFile = groups => {
  var data = 'var ClubhouseProjects = [];';
  _.each(_.filter(groups, { archived: false }), function (group) {
    data += `ClubhouseProjects.push({ id: "${group.id}", name: "${group.name}"});`;
  });
  _.each(_.filter(groups, { archived: true }), function (group) {
    data += `ClubhouseProjects.push({ id: "${group.id}", name: "${group.name}" (archived)});`;
  });
  fs.writeFileSync(PROJECT_FILE, data);
}

function fetchAndCompileChartForProject(project, callback) {
  callback = _.isFunction(callback) ? callback : _.noop;
  console.log('Fetching completed stories for project "' + project.name + '"...');

  services.fetchCompletedStoriesForProject(project.id, function (err, res, stories) {
    stories = JSON.parse(stories).filter(story => story.completed_at !== null);
    compileChartData(stories, project);
    callback();
  });
}

function fetchAndCompileChartsForAllProjects(projects) {
  var project = projects.shift();

  if (project) {
    fetchAndCompileChartForProject(project, function () {
      fetchAndCompileChartsForAllProjects(projects);
    });
  }
}

function findMatchingProjects(projects, query) {
  if (query === 'all') {
    return _.filter(projects, { archived: false });
  }

  return _.filter(projects, function (project) {
    return parseInt(query, 10) === project.id || project.name.toLowerCase().indexOf(query) === 0;
  });
}

function compileProjectData() {
  var query = process.argv[3];
  console.log('Fetching projects...');

  services.fetchProjects(function (err, res, projects) {
    projects = JSON.parse(projects);

    if (err || !projects || projects.length === 0) {
      console.log('No projects found!');
      return false;
    }

    projects = _.sortBy(projects, 'name');
    saveProjectsToFile(projects);

    var foundProjects = findMatchingProjects(projects, query);
    if (!query || foundProjects.length === 0) {
      if (foundProjects.length === 0) {
        console.log('Matching project not found!');
      }
      console.log('You have access to the following projects:\n');

      projects.forEach(function (project) {
        console.log('  - ' + project.name);
      });

      return false;
    }

    fetchAndCompileChartsForAllProjects(foundProjects);
  });
}

function compileGroupData() {
  console.log('Fetching groups...');

  services.fetchGroups((err, res, groups) => {
    groups = _.sortBy(JSON.parse(groups), 'name');

    groups.forEach(group => {
      const { id: groupId} = group;
      services.fetchGroupStories(groupId, (err, res, stories) => {
        stories = JSON.parse(stories).filter(story => story.completed_at !== null);
        compileChartData(stories, group);
      });
    });

    saveGroupsToFile(groups);
  });
}

function displayNoTokenMessage() {
  console.log('Missing CLUBHOUSE_API_TOKEN environment variable.');
  console.log('If you don\'t already have one, go to Clubhouse > Settings > Your Account > API Tokens to create one.');
  console.log('Then run this command:');
  console.log('CLUBHOUSE_API_TOKEN="MYTOKEN"');
}

function displayNoGroupingTypeMessage() {
  console.log('Missing grouping argument');
  console.log('Use --project if you want to generate your charts by project.');
  console.log('Use --group if you want to generate your charts by group');
}

function init() {
  if (!TOKEN) {
    return displayNoTokenMessage();
  }

  var groupingType = process.argv[2];

  switch(groupingType) {
    case GROUPING_TYPES.group:
      compileGroupData();
      break;
    case GROUPING_TYPES.project:
      compileProjectData();
      break;
    default:
      displayNoGroupingTypeMessage();
  }
}

init();
