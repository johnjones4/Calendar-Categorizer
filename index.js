var icalendar = require('icalendar');
var request = require('request');
var config = require('./config');
var Table = require('cli-table');

var rangeStart = new Date(Date.parse(config.dateRange.start));
var rangeEnd = new Date(Date.parse(config.dateRange.end));

request(config.ics,function(err,data) {
  if (err) {
    bailOut(err);
  } else {
    var ical = icalendar.parse_calendar(data.body);
    var events = buildOutEventArray(ical);
    var calendar = buildCalendar();
    populateCalendar(calendar,events);
    var uncategorizableEvents = categorizeEvents(calendar);
    printCalendar(calendar);
    if (uncategorizableEvents.length > 0) {
      printUncategorizable(uncategorizableEvents);
      process.exit(-1);
    } else {
      process.exit(0);
    }
  }
});

function buildOutEventArray(icsCalendar) {
  var events = [];
  icsCalendar.events().forEach(function(event) {
    var summary = event.properties.SUMMARY[0].value;
    var start = new Date(Date.parse(event.properties.DTSTART[0].value));
    var end = new Date(Date.parse(event.properties.DTEND[0].value));
    var timespan = end.getTime() - start.getTime();
    events.push({
      'summary': summary,
      'start': start,
      'end': end,
      'timespan': timespan
    });
    if (event.properties.RRULE && event.properties.RRULE[0].value.WKST) {
      delete event.properties.RRULE[0].value.WKST;
    }
    if (event.rrule()) {
      event.rrule().nextOccurences(rangeStart,rangeEnd).forEach(function(startDate) {
        events.push({
          'summary': summary,
          'start': startDate,
          'end': new Date(startDate.getTime() + timespan),
          'timespan': timespan
        });
      });
    }
  })
  return events;
}

function buildCalendar() {
  var calendar = [];
  for (var d = rangeStart.getTime(); d < rangeEnd.getTime(); d += 86400000) {
    calendar.push({
      'date': new Date(d),
      'events': [],
      'time': {}
    });
  }
  return calendar;
}

function populateCalendar(calendar,calendarItems) {
  calendar.forEach(function(calendarItem) {
    calendarItems.forEach(function(event) {
      if (event.start
        && event.end
        && event.start.getFullYear() == calendarItem.date.getFullYear()
        && event.start.getMonth() == calendarItem.date.getMonth()
        && event.start.getDate() == calendarItem.date.getDate()) {
          calendarItem.events.push(event);
        }
    });
  });
}

function categorizeEvents(calendar) {
  var uncategorizable = [];
  calendar.forEach(function(calendarItem) {
    calendarItem.events.forEach(function(event) {
      var cat = getCategoryForEvent(event);
      if (cat) {
        if (calendarItem.time[cat]) {
          calendarItem.time[cat] += event.timespan;
        } else {
          calendarItem.time[cat] = event.timespan;
        }
      } else {
        uncategorizable.push(event);
      }
    });
  });
  return uncategorizable;
}

function getCategoryForEvent(event) {
  for(var category in config.categories) {
    var foundKeyword = config.categories[category]
      .concat([category])
      .find(function(keyword) {
        return event.summary.toLowerCase().indexOf(keyword.toLowerCase()) >= 0;
      });
    if (foundKeyword) {
      return category;
    }
  }
  return null;
}

function printCalendar(calendar) {
  var categories = [];
  for(var category in config.categories) {
    categories.push(category);
  }
  var table = new Table({
    'head': ['Date'].concat(categories).concat(['Total'])
  });
  calendar.forEach(function(calendarItem) {
    var row = [
      calendarItem.date.toDateString()
    ];
    var total = 0;
    categories.forEach(function(category) {
      if (calendarItem.time[category]) {
        row.push(millisToHours(calendarItem.time[category]));
        total += calendarItem.time[category];
      } else {
        row.push(0);
      }
    });
    row.push(millisToHours(total))

    table.push(row);
  });
  console.log(table.toString());
}

function printUncategorizable(uncategorizable) {
  var table = new Table({
    'head': ['Date','Title','Time']
  });
  uncategorizable.forEach(function(event) {
    table.push([
      event.start.toDateString(),
      event.summary,
      millisToHours(event.timespan)
    ]);
  });
  console.log(table.toString());
}

function millisToHours(m) {
  return twoDecimalPlaces(m / 1000 / 60 / 60);
}

function twoDecimalPlaces(n) {
  return Math.round(n * 100) / 100;
}

function bailOut(err) {
  console.error(err);
  process.exit(-1);
}
