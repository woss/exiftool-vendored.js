import * as _dt from './datetime'
import { expect } from 'chai'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)

describe('ExifDateTime', () => {
  describe('example strings with no tz', () => {
    const dt = _dt.parse('DateTimeOriginal', '2016:08:12 07:28:50') as _dt.ExifDateTime
    it('year/month/day', () => {
      expect([dt.year, dt.month, dt.day]).to.eql([2016, 8, 12])
    })
    it('hour/minute/second', () => {
      expect([dt.hour, dt.minute, dt.second]).to.eql([7, 28, 50])
    })
    it('.toISOString', () => {
      expect(dt.toISOString()).to.eql('2016-08-12T07:28:50')
    })
    it('Renders a Date assuming the current timezone offset', () => {
      expect(dt.toDate().toLocaleString('en-US')).to.eql('8/12/2016, 7:28:50 AM')
    })
  })

  describe('example strings with UTC tzoffset', () => {
    const dt = _dt.parse('GPSDateTime', '2011:01:23 18:19:20') as _dt.ExifDateTime
    it('year/month/day', () => {
      expect([dt.year, dt.month, dt.day]).to.eql([2011, 1, 23])
    })
    it('hour/minute/second', () => {
      expect([dt.hour, dt.minute, dt.second]).to.eql([18, 19, 20])
    })
    it('tzoffset', () => {
      expect(dt.tzoffsetMinutes).to.eql(0)
    })
    it('.toISOString', () => {
      expect(dt.toISOString()).to.eql('2011-01-23T18:19:20Z')
    })
    it('Renders a Date assuming the current timezone offset', () => {
      const d = dt.toDate()
      expect([d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]).to.eql([2011, 1, 23])
      expect([d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]).to.eql([18, 19, 20])
    })
    it('Renders a UTC Date assuming the current timezone offset', () => {
      expect(dt.toDate().toISOString()).to.eql('2011-01-23T18:19:20.000Z')
    })
  })

  describe('example strings with tz', () => {
    const dt = _dt.parse('DateTimeOriginal', '2013:12:30 11:04:15-05:00') as _dt.ExifDateTime // non-local offset
    it('year/month/day', () => {
      expect([dt.year, dt.month, dt.day]).to.eql([2013, 12, 30])
    })
    it('hour/minute/second', () => {
      expect([dt.hour, dt.minute, dt.second]).to.eql([11, 4, 15])
    })
    it('tzoffset', () => {
      expect(dt.tzoffsetMinutes).to.eql(-60 * 5)
    })
    it('.toISOString', () => {
      expect(dt.toISOString()).to.eql('2013-12-30T11:04:15-05:00')
    })
    it('Renders a Date assuming the forced timezone offset', () => {
      const d = dt.toDate()
      expect([d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]).to.eql([2013, 12, 30])
      expect([d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]).to.eql([11 + 5, 4, 15])
    })
    it('Renders a UTC Date assuming the current timezone offset', () => {
      expect(dt.toDate().toISOString()).to.eql('2013-12-30T16:04:15.000Z')
    })
  })
})

describe('ExifTime', () => {
  const dt = _dt.parse('RunTimeSincePowerUp', '12:03:45') as _dt.ExifTime
  it('hour/minute/second', () => {
    expect([dt.hour, dt.minute, dt.second]).to.eql([12, 3, 45])
  })
})

describe('ExifTime from GPS', () => {
  const dt = _dt.parse('GPSTimeStamp', '05:28:09') as _dt.ExifTime
  it('hour/minute/second', () => {
    expect([dt.hour, dt.minute, dt.second]).to.eql([5, 28, 9])
  })
  it('tzoffset', () => {
    expect(dt.tzoffsetMinutes).to.eql(0)
  })
})

describe('ExifDate', () => {
  const dt = _dt.parse('DateCreated', '2016:09:10') as _dt.ExifDate
  it('year/month/day', () => {
    expect([dt.year, dt.month, dt.day]).to.eql([2016, 9, 10])
  })
})

describe('ExifDate from GPS', () => {
  const dt = _dt.parse('GPSDateStamp', '2016:08:12') as _dt.ExifDate
  it('year/month/day', () => {
    expect([dt.year, dt.month, dt.day]).to.eql([2016, 8, 12])
  })
  it('tzoffset', () => {
    expect(dt.tzoffsetMinutes).to.eql(0)
  })
})