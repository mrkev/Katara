/* global require, module, console */
'use strict';


var Promise = require('es6-promise').Promise;
var remap   = require('obender').remap;
var xml2js  = require('xml2js');
var rp      = require('request-promise');

/**
 * Katara v0.0.0
 *
 * Exports for the module.
 * @return {NetPrintSource}
 */
module.exports = (function () {
    function RedRosterSource(url) {
        var self = this;
        self._url = url;
        self.interval = 604800000 / 7; // One day
        self.data = {};
        // We will clear the data every day to get fresh, updated info.
        self.timer = setTimeout(self.clear, self.interval);
    }

    /**
     * Queries official XML roster source for course informaiton.
     * @param  {String} subj Subject key of XML source to query.
     * @param  {String} term Term key of XML source to query
     * @return {Promise}     I swear I'll return some converted JSON, 
     *                       unless it doesn't.
     */
    RedRosterSource.prototype.query = function(subj, term) {
        term = (term === undefined || term === null ? 'FA14' : term);
        subj =  subj === undefined || subj === null ? ''     : subj;

        var self  = this;
        var url   = self._url + term + '/' + subj + (subj === '' ? '' : '/') 
                    + 'xml/';

        return new Promise(function (resolve, reject) {

            // Query XML
            return rp(url)

            // Convert to JSON
            .then(JSON_from_XML)

            // Remove them crazy dollar signs.
            .then(undollarify)

            // Fix all the madness
            .then(function (data) {

                // On Roster choosing page. Remove XML attribute and replace 
                // with JSON attribute
                if (data.subjects !== undefined)    {remap_homepage(data);}
                else                                {remap_courses(data);}

                self.data[term] = self.data[term] || {};
                self.data[term][subj] = data;
                resolve(data);
            })


            .catch(reject);

        });
    };


    RedRosterSource.prototype.clear = function() {
        this.data = null;
    };

    RedRosterSource.prototype.getJSON = function(subj, term) {

        if (this.data[term] === undefined || 
            this.data[term][subj] === undefined) {
            return this.query(subj, term);

        } else {
            return Promise.resolve(this.data[term][subj]);
        }
    };

    return new RedRosterSource('http://registrar.sas.cornell.edu/courses/roster/');
})();


var remap_homepage = function (data) {
    
    // Term
    data.term = data.subjects.term;

    // Subject Array
    var subjarr = [];
    for (var subj in data.subjects.subject) {
        var obj = data.subjects.subject[subj];

        // Rename stuff
        remap({
            'subject' : 'key',
            'subject_ldescr' : 'name'
        }, obj);

        // --XML ++JSON
        delete obj.xml;
        obj.json = 'http://api-mrkev.rhcloud.com/redapi/roster?' + obj.key;


        subjarr.push(data.subjects.subject[subj]);
    }

    data.subjects = subjarr;
};

var remap_courses = function (subject) {
    // Term, dateloaded, datetime_loaded
    subject.term          = subject.courses.term;
    subject.date_load     = subject.courses.date_load;
    subject.datetime_load = subject.courses.datetime_load;

    // // Courses Array
    // var crsarr = [];
    // for (var crs in subject.courses.course) {
    //  var obj = subject.courses.course[crs];
    //  
    //  // For course_title, units, etc.
    //  remove_singleton_string_arrays(obj);
    //  remap({
    //      'course_title' : 'title',
    //      'grading_basis_sdescr' : 'grading_basis',
    //      'subject' : 'subject_key',
    //      'catalog_nbr': 'catalog_number'
    //  }, obj);
    //  crsarr.push(obj);
    // }
    // 
    // subject.courses = crsarr;

    magic(subject, 'courses', 'course', function (obj) {
        remove_singleton_string_arrays(obj);
        remap({
            'course_title' : 'title',
            'grading_basis_sdescr' : 'grading_basis',
            'subject' : 'subject_key',
            'catalog_nbr': 'catalog_number',
            'class_descr': 'class_description'
        }, obj);


        // TODO claring 'outsides'.
        open_array('crosslists', obj);
        magic(obj, 'crosslists', 'course', function (crss) {
            remove_singleton_string_arrays(crss);
            remap({
                'catalog_nbr' : 'catalog_number',
                'subject' : 'subject_key'
            }, crss);
        });

        open_array('sections', obj);
        magic(obj, 'sections', 'section', function (sct) {
            remove_singleton_string_arrays(sct);
            open_array('meeting', sct);

            remap({
                'catalog_nbr' : 'catalog_number',
                'consent_ldescr' : 'consent_description',
                'subject' : 'subject_key'
            }, sct);

            if (sct.meeting) {
                remove_singleton_string_arrays(sct.meeting);
                remap({
                    'facility_ldescr' : 'facility_description',
                    'meeting_pattern_sdescr' : 'meeting_pattern'
                }, sct.meeting);

                if (sct.meeting.instructors !== undefined)  {
                    open_array('instructors', sct.meeting); 
                    magic(sct.meeting, 'instructors', 'instructor', function () {});
                }
            }
            
            open_array('notes', sct);
            magic(sct, 'notes', 'note', function () {}); // TODO: Does magic work with null -function
        });


        open_array('topics', obj);
        magic(obj, 'topics', 'topic', function () {});

    });
};

/**
 * Makes the contents of object.outside those of 
 * object.outside.inside, where object.outside.inside is an array.
 * It runs function func(obj) once for each child of object.outside.inside.
 * @return {[type]} [description]
 */
var magic = function (object, outside, inside, func) {

    // Die if outside doesn't exist.
    if (object[outside] === undefined) {
        console.dir(object);
        console.dir(object[outside]);
        throw new Error('DAMN MAGIC');
    }
    
    // If outside is empty, make it an empty array
    if (object[outside][inside] === '' || 
        object[outside][inside] === {}) {
        object[outside][inside] = [];
    }

    // Do the magic
    var arr = [];
    for (var crs in object[outside][inside]) {
        var obj = object[outside][inside][crs];
        func(obj);
        arr.push(obj);
    }
    
    object[outside] = arr;
};

/**
 * For every property of this object, checks if property is an array with a
 * single string object. If so, it gets rid of the array and sets the property
 * to that string
 * @param  {[type]} obj The object to be checked
 */
var remove_singleton_string_arrays = function (obj) {
    for (var prop in obj) {
        if (Array.isArray(obj[prop]) && 
            obj[prop].length === 1 && 
            typeof obj[prop][0] === 'string') {
            obj[prop] = obj[prop][0];
        }
    }
};

var open_array = function (prop, obj) {
    if (Array.isArray(obj[prop]) && 
        obj[prop].length === 1) {
        obj[prop] = obj[prop][0];
    }
};

var JSON_from_XML = function (data) {
    
    var parser = new xml2js.Parser();

    return new Promise(function (resolve, reject) {

        parser.parseString(data, function (err, result) {
            if (err instanceof Error) reject(err);

            console.log('Done parsing roster XML.', result);

            resolve(result);

        });
        
    });

};

var undollarify = function (object) {
    if (typeof object !== 'object') return;

    unwind(object, '$');

    for (var prop in object) {
        undollarify(object[prop]);
    }

    return object;
};

/**
 * Unwinds property attr in object if it's an object, giving all of attr's properties
 * to object
 * @param  {Object} object [description]
 * @param  {String} attr   [description]
 */
var unwind = function (object, attr) {
    for (var attrname in object) {
        if (attrname === attr) {

            for (var childattr in object[attr]) {
                if (object[childattr] === undefined) {
                    object[childattr] = object[attr][childattr];
                    delete object[attr][childattr];

                } else {
                    console.error ('Error undollarfying');
                    console.log(object);
                    console.log ('Object already has property ' + childattr);
                }
            }

            if (Object.keys(object[attr]).length === 0) delete object[attr];

        }
    }
};