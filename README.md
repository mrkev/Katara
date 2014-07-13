Katara
=================

Roster module for the RedAPI. Can be used to fetch info about Cornell roster in general.


	var roster = require('Katara');
	
	roster.getJSON('CS').then(console.log).catch(console.error); 
	roster.getJSON('CS', 'FA14').then(console.log);
	
	// Note: Currently only FA14 is tested, though it *should* work with other terms. Info about issues apreciated.

Note: this is the package officialy used at `http://api-mrkev.rhcloud.com/redapi/roster`.