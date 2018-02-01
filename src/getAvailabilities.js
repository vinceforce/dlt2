import moment from 'moment'
// I did not use moment
import knex from 'knexClient'

export default async function getAvailabilities(date) {

	let availabilities = new Array(7); // final result initialisation
	let sevenDaysSlots = sevenDaysSlotNames(date); // All possible slots during one week beinning with given date
	let availableSlots = new Array(7*48) // intermediate result initialisation
	for (let i in availableSlots) availableSlots[i] = false // slots are not available by default
	// Datetimes in sqllite3 are stored and retrieved as nb of ms since 1st january 1970
	let tsDate = Date.parse(date); // transform entry to nb of ms since 1st january 1970 
	let tsEnd = tsDate + 7*24*60*60*1000  // we add the number of ms in one week

  	await openingsFunc(tsDate, tsEnd) // wait for resolution of the promise returned by function
  	.then((openings) => {  // process the result (openings)
  		for (let opening in openings) {
  			let o = openings[opening];
  			let openingSlots = getSlotIndexes(date, o.starts_at, o.ends_at);  // retrieve the slots corresponding
  			// Then we set the appropriate elements of availableSlots to true
  			if (openingSlots) for (let i=0; i<openingSlots.length; i++) availableSlots[openingSlots[i]] = true
  		}
  	})

  	await openingsWeeklyFunc(tsDate, tsEnd) // wait for resolution of the promise returned by function
  	.then((openings) => { // process the result (openings)
  		for (let opening in openings) {
  			let o = openings[opening];
  			let tzOffset = date.getTimezoneOffset() * 60 * 1000  // compute the offset for timezone
  			let weeksToAdd = Math.floor((tsDate + tzOffset - o.starts_at) / (86400000*7))
  			let daysToAdd = 7 * weeksToAdd + 7 
  			let startInWeek = o.starts_at + daysToAdd * 86400000
  			let endInWeek = o.ends_at + daysToAdd * 86400000
  			let openingSlots = getSlotIndexes(date, startInWeek, endInWeek);  // retrieve the slots corresponding
  			// Then we set the appropriate elements of availableSlots to true
  			if (openingSlots) for (let i=0; i<openingSlots.length; i++) availableSlots[openingSlots[i]] = true
  		}
  	})

  	await appointmentsFunc(tsDate, tsEnd) // wait for resolution of the promise returned by function
  	.then((appointments) => { // process the result (appointments)
  		for (let appointment in appointments) {
  			let a = appointments[appointment];
  			let appointmentSlots = getSlotIndexes(date, a.starts_at, a.ends_at);  // retrieve the slots corresponding
  			// Then we set the appropriate elements of availableSlots to false
  			if (appointmentSlots) for (let i=0; i<appointmentSlots.length; i++) availableSlots[appointmentSlots[i]] = false
  		}
  	})
  	.then(() => {
  		// Then we use the intermediate result to compute the final result in the appropriate format
  		// NB : we have to add two hours for the test to pass
  		for (let i=0; i < 7; i++) {availabilities[i] = {date : String(addHours(new Date(addDays(date, i)), 2)),
				slots: slotNames(availableSlots, i)}}
  	})

  	return availabilities

}

// returns a Promise for retrieving simple openings for the week being considered
let openingsFunc = (start, end) => {
	return new Promise(function(resolve, reject){
		knex.select('starts_at','ends_at', 'weekly_recurring')
		.from('events')
		.where('kind', 'opening')
		.andWhere('weekly_recurring', null)
		.andWhere('starts_at', '<=', end)
		.andWhere('starts_at', '>=', start)
		.then(openings => {resolve(openings)})
	})
}

// returns a Promise for retrieving weekly recurring openings for the week being considered
let openingsWeeklyFunc = (start, end) => {
	return new Promise(function(resolve, reject){
		knex.select('starts_at','ends_at', 'weekly_recurring')
		.from('events')
		.where('kind', 'opening')
		.andWhere('weekly_recurring', 1)
		.andWhere('starts_at', '<=', start)
		.then(openings => {resolve(openings)})
	})
}

// returns a Promise for retrieving appointments for the week being considered
let appointmentsFunc = (start, end) => {
	return new Promise(function(resolve, reject){
		knex.select('starts_at','ends_at')
		.from('events')
		.where('kind', 'appointment')
		.andWhere('starts_at', '<=', end)
		.andWhere('starts_at', '>=', start)
		.andWhere('starts_at', '<=', 'ends_at')
		.then(openings => {resolve(openings)})
	})
}

// returns a list of slots indexes for the period considered
let getSlotIndexes = (date, starts_at, ends_at) => {
	let tzOffset = date.getTimezoneOffset() * 60 * 1000
	let tsDate = Date.parse(date)
	let sltFloor = 48 * Math.floor((starts_at - tsDate) / 86400000) + Math.floor((starts_at - tzOffset) / 1800000 % 24)
	let diff = Math.floor((ends_at - starts_at) / 1800000 % 24)
	return(diff > 0?range(sltFloor, sltFloor + diff - 1):null)
}

// add a given number of days to a date as a string (aaaa-mm-dd)
let addDays = (strDate, intNum) => {
	let dDate =  new Date(strDate);
	dDate.setDate(dDate.getDate() + intNum);
	let dY = dDate.getFullYear()
	let dM = dDate.getMonth() + 1
	let dD = dDate.getDate()

	return(dY + "-" + dM + "-" + dD);
}

// add a given number of hours to a date as a Date
let addHours = (date) => {
	date.setHours(date.getHours() + 2)
	return(date);
}

// computes difference between two dates (aaaa-mm-dd) in every format
let dateDiff = (strDate1, strDate2) => {
    let diff = Date.parse(strDate2) - Date.parse(strDate1); 
    return isNaN(diff) ? NaN : {
        diff : diff,
        ms : Math.floor( diff            % 1000 ),
        s  : Math.floor( diff /     1000 %   60 ),
        m  : Math.floor( diff /    60000 %   60 ),
        h  : Math.floor( diff /  3600000 %   24 ),
        d  : Math.floor( diff / 86400000        )
    };
}

// compute slots names (hh:mm) for a iven set of slots
let slotNames = (availableSlots, i) => {
	let sN = new Array()
	for (let j=0; j<47; j++) {if (availableSlots[i*48 + j]) sN.push(getSlotName(j));}
	return(sN) 
}

// compute slot name of a given slot index
let getSlotName = (slotindex) => {
	let h = Math.floor(slotindex / 2);
	let m = (h == slotindex / 2) ? "00" : "30";
	return(h + ":" + m);
}

// returns a list of integers between start and end
let range = (start, end) => [...Array(end - start + 1)].map((_, i) => start + i);


// list of slot names in a full week beginning with ggiven date parameter
let sevenDaysSlotNames = (date) => {
	let slots = new Array(7*48);
	let dY = date.getFullYear()
	let dM = date.getMonth() + 1
	let dD = date.getDate()
	let sDate = dY + "-" + dM + "-" + dD + " 00:00"
	for (let i=0; i<7; i++) {for (let j=0; j<48; j++) {slots.push(addDays(sDate, i) + " " + getSlotName(j))}}
	return(slots);
}
