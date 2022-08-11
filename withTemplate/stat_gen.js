const fs = require('fs')
const http = require('http')

const redStatus = {
  open: '신규',
  inProgress: '조치중',
  reopen: '재결함',
  inReview: '조치완료',
  underReview: '검토완료',
  approved: '확인완료',
  improvement: '개선사항',
  nonError: '비결함',
}

const REDMINE_HOST = 'http://10.2.55.67'

const MARK1 = '&#10004;' // &#9989;
const MARK_CHECK = '&#10004;'
const MARK_STAR = '&#10035;'
const MARK_INIT = '&#128154;'

/// FIXME : template.html also have these
const DELAY_REDLINE = 4
const DELAY_YELLOWLINE = 1

function timestamp2() {
  const today = new Date()
  today.setHours(today.getHours() + 9)
  return today.toISOString().replace('T', ' ').substring(5, 16)
}

function getFilteredCount(tuple, filter) {
  return filter.map(f => tuple[f].length).reduce((acc, cur) => acc + cur, 0)
}

function getFilteredRecords(tuples, filter) {
  return tuples.filter(tuple => getFilteredCount(tuple, filter))
}

function calculateBizDays(startDate, endDate) {
  startDate.setHours(0, 0, 0, 1)
  endDate.setHours(23, 59, 59, 999)

  const oneDayInMs = 24 * 60 * 60 * 1000
  const diff = endDate - startDate
  let days = Math.floor(diff / oneDayInMs)
  const weeks = Math.floor(days / 7)

  // subtract two weekend days for every week in between
  days -= weeks * 2

  const startDay = startDate.getDay() // 0, 1, 2, 3, 4, 5, 6
  const endDay = endDate.getDay()

  // handle a case which less than 7 but incl. weekend
  if (startDay - endDay >= 1) {
    // condition modified by kevin (rule of thumb)
    days -= 2
  }
  // remove start day if span starts on Sun but end before Sat.
  if (startDay === 0 && endDay != 6) {
    days--
  }
  // remove end day if span ends on Sat but starts after Sun.
  if (endDay === 6 && startDay != 0) {
    days--
  }

  const rtfNum = new Intl.RelativeTimeFormat('ko', {numeric: 'always'})
  const rtfStr = new Intl.RelativeTimeFormat('ko', {numeric: 'auto'})
  const dayNum = rtfNum.formatToParts(-1 * days, 'day').find(x => x.type === 'integer').value
  return {
    dayStr: rtfStr.format(-1 * days, 'day'),
    dayNum,
    dayColor: getColorByDelayedDay(dayNum).bigColor,
  }
}

// const decideIssueType = kind => (kind === '개선사항' || kind === '비결함' ? 'noerror' : 'error')

function numericInit(status) {
  let numericStatus = {...status}
  Object.keys(status).map(k => (numericStatus[k] = 0))
  return numericStatus
}

function arrayInit(status) {
  let arrayStatus = {...status}
  Object.keys(status).map(k => (arrayStatus[k] = []))
  return arrayStatus
}

function getSummary2(list) {
  const issueIsDefect = kind => (kind === '개선사항' ? false : true)
  let scorecard = {
    total: list.length,
    ...numericInit(redStatus),
  }

  let defectList = []
  let delayedList = []
  let improvementList = []
  const {improvement, nonError, ...subStatus} = redStatus

  list.map(item => {
    const status = item['current_status']
    const issueNum = item['issue_number']
    const issueKind = item['issue_kind']
    const regiDay = new Date(item['reg_date'])
    const {dayStr, dayNum, dayColor} = calculateBizDays(regiDay, new Date())
    const author = item['author']
    const subject = decodeURI(item['subject'])
    let name = 'nobody'
    item = {...item, dayStr, dayNum, dayColor}

    if (issueKind === '개선사항') {
      scorecard.improvement++
    } else if (issueKind === '비결함') {
      scorecard.nonError++
    }

    switch (status) {
      case '신규':
      case '재결함':
      case '조치중':
        name = item['current_worker']

        const regiDay = new Date(item['reg_date'])
        const {dayStr, dayNum, dayColor} = calculateBizDays(regiDay, new Date())

        /// add defects to delayedList
        issueIsDefect(issueKind) &&
          delayedList.push({
            name,
            issueNum,
            dayStr,
            dayNum,
            isUpgrade: false,
            title: decodeURI(item['subject']),
            author,
          })
        break
      case '조치완료':
        name = item['current_worker'] || item['fix_worker'] || item['author']
        break
      case '검토완료':
      case '확인완료':
        name = author
        break
      default:
        console.log(`Warning: unknown status 2(#${issueNum} ${status})`)
        consoel.log(JSON.stringify(item))
        break
    }
    let currentList = issueIsDefect(issueKind) ? defectList : improvementList
    let assignee = currentList.find(a => a.name === name)
    if (!assignee) {
      assignee = {
        name,
        ...arrayInit(subStatus),
      }
      currentList.push(assignee)
    }
    const key = Object.keys(redStatus).find(k => redStatus[k] === status)
    const title = `${author} : ${subject}`

    if (key) {
      scorecard[key]++
      assignee[key].push({
        issueKind,
        issueNum,
        title,
        item, ///20222.08.01 for inline detail modal popup
      })
    } else {
      console.log(`+ Warning: unknown status(${status})`)
    }
    currentList = currentList.map(a => (a.name === assignee.name ? assignee : a))
  })
  defectList = defectList.sort((a, b) => b.open.length + b.inProgress.length + b.reopen - (a.open.length + a.inProgress.length + a.reopen))
  improvementList = improvementList.sort((a, b) => b.open.length + b.inProgress.length + b.reopen - (a.open.length + a.inProgress.length + a.reopen))

  function getStateStatus(list) {
    let total = 0
    let status = {}
    Object.keys(subStatus).map(key => {
      status[key] = list.map(x => x[key].length).reduce((acc, cur) => acc + cur, 0)
      total += status[key]
    })
    return {
      total,
      ...status,
    }
  }
  const defectStatus = getStateStatus(defectList)
  const improvementStatus = getStateStatus(improvementList)

  return {
    scorecard,
    defectList,
    improvementList,
    defectStatus,
    improvementStatus,
    delayedList,
  }
}

function getSubHeader(prefix, status) {
  console.log({status})
  const undone = status.open + status.inProgress + status.reopen
  const done = status.total - undone
  const percent = !done ? 0 : `${((done / status.total) * 100).toFixed(0)}`
  return `
    <h3> ${MARK1} ${prefix === 'small' ? '개선사항' : '결함'} 조치현황
      <button class="issue1-button" title="신규,조치중,재결함" 
        onclick="showAllIssue('${prefix}', ['open', 'inProgress', 'reopen'])">
        진행중
      </button>
      <button class="issue1-button" title="클리어"
       onclick="showAllIssue('${prefix}', [])">
        지움
      </button>
      <label for="progress-bar">진행율 ${percent}</label> 
      <progress id="progress-bar" value="${percent}" max="100"> ${percent} </progress>
    </h3>
    <p class="subtitle">조치율 ${percent}% [전체: ${status.total}, 진행중: ${undone}] </p>
    <span style="color: red; font-size: 14px; font-weight: bold;"> &nbsp; ${MARK_CHECK} &nbsp; 파란색 원 클릭시 해당 유형만 결함링크에 표시 </span>
  `
}

function getTable(prefix, status, records) {
  const header = [
    {key: 'name', title: 'Name', width: '5%'},
    {key: 'open', title: '신규', width: '5%'},
    {key: 'inProgress', title: '조치중', width: '5%'},
    {key: 'reopen', title: '재결함', width: '5%'},
    {key: 'inReview', title: '조치완료', width: '5%'},
    {key: 'underReview', title: '검토완료', width: '5%'},
    {key: 'approved', title: '확인완료', width: '5%'},
    {key: 'status', title: '상태', width: '5%'},
    {key: 'issues', type: 'issueLink', title: '비고', width: '60%'},
  ]
  const subHeader = getSubHeader(prefix, status)

  let ths = ''
  let cols = ''

  header.forEach(hdr => {
    cols += ` <col span="1" width="${hdr.width}" style="background-color: #FF9C4;"> `
    ths += `<th style="text-align: center;">${hdr.title}</th>`
  })
  let table = `
    <div class="onepiece">
      <div class="trow">
        <div class="tcards">
          <table id="${prefix}-table" class="guide_table">
            <colgroup>${cols}</colgroup> 
            <tr>${ths}</tr>
  `

  let NOTUSED_offset = 0 /// for dynamic status and issues html (tr/td)
  records.map((record, idx) => {
    let tdHtml = ''
    let NOTUSED_linkCount = 0
    header.map(({key}, jdx) => {
      const valId = `${prefix}_${idx}_${key}`
      let copyButton = ''
      let blockStyle = 'td-block'
      const needLink = Array.isArray(record[key]) && record[key].length && key !== 'approved'
      if (needLink) {
        NOTUSED_linkCount += record[key].length
      }
      let text = redStatus.hasOwnProperty(key) ? record[key].length : record[key] || 'STATUS_TODO'
      // const targetId = `${prefix}_$${idx}_issues`
      const showTag = needLink ? `<button class="issue2-button" onclick="showIssueWithInit('${prefix}', ${idx}, '${key}' )"> ${text} </button>` : ''
      tdHtml += `
        <td id="${valId}" style="text-align: center; word-break: break-all;" rowspan="1">
          <div class="${blockStyle}">
            <div class="td-edit" id="${valId}">
              ${needLink ? `<button class="issue2-button" onclick="showIssueWithInit('${prefix}', ${idx}, '${key}' )"> ${text} </button>` : text}
            </div>
          </div>
        </td>
      `
    })
    table += ` <tr id="${prefix}_tr_${idx}" data-offset="${NOTUSED_offset}" data-items="${NOTUSED_linkCount}"> ${tdHtml} </tr> `
    NOTUSED_offset += NOTUSED_linkCount
  })

  if (records.length === 0) {
    table += `
      <tr id="non-exist">
        <td colspan="${header.length}" style="text-align: center; word-break: break-all;">
          <div class="td-block">
            <div lass="td-edit">
              존재하지 않습니다.
            </div>
          </div>
        </td>
      </tr>
    `
  }
  table += `</table>
          </div>
        </div>
      </div> <br>
  `
  return subHeader + table
}

function getColorByDelayedDay(delayedDay) {
  const bgColor = delayedDay > DELAY_REDLINE ? 'red' : delayedDay > DELAY_YELLOWLINE ? 'yellow' : 'aqua'
  const textColor = bgColor === 'red' ? 'white' : bgColor === 'yellow' ? 'gray' : 'orange'

  return {bgColor, textColor}
}

function getStatusCircleHtml(dayNum) {
  const {bgColor, textColor} = getColorByDelayedDay(dayNum)
  return `
    <span class="status" style="background-color: ${bgColor}; font-size: 0.9rem; color: ${textColor}; display: inline-block; text-align: center; margin-right: 10px;">${dayNum}</span>
  `
}

function getDelayTable(records) {
  const statusRedline = 4 // days
  const statusYellowline = 1
  const statusRedCount = records.filter(x => x.dayNum > statusRedline).length
  const statusYellowCount = records.filter(x => x.dayNum > statusYellowline).filter(x => x.dayNum <= statusRedline).length
  const statusNormalCount = records.length - (statusRedCount + statusYellowCount)
  const aHeader = [
    {title: '상태', width: '5%'},
    {key: 'name', title: 'Name', width: '10%'},
    {key: 'dayStr', title: '등록일', width: '10%'},
    {key: 'issue', type: 'issueLink', title: '결함', width: '75%'},
  ]
  let content = `<br><br><h3>${MARK_CHECK} 지연결함 현황 (기준 2영업일 이상) </h3>
    <p class='subtitle'>[전체: ${records.length}, 지연: ${statusRedCount}, 경고: ${statusYellowCount}, 일반: ${statusNormalCount}] </p>
  `

  let ths = ''
  let cols = ''
  aHeader.forEach(hdr => {
    cols += `<col span='1' width='${hdr.width}' style='background-color: #FF9C4;'`
    ths += `<th style='text-align: center;'>${hdr.title}</th>`
  })
  let table = `
    <div class='onepiece'>
      <div class='trow'>
        <div class='tcards'>
          <table class='guide_table'>
            <colgroup> ${cols} </colgroup>
            <tr> ${ths} </tr>
  `
  const header = aHeader.slice(1) // remove 1st column : title
  records.length &&
    records.map(aRecord => {
      let tdHtml = ''
      const {author, title, dayNum, isUpgrade, ...record} = aRecord
      const statusTag = isUpgrade ? `<span class='issue-clear'>${MARK_INIT}</span>` : getStatusCircleHtml(dayNum)
      const status = `
      <td style='text-align: center; word-break: break-all;'>
        <div class='td-block'>
          <div class='td-edit'>
            ${statusTag}
          </div>
        </div>
      </td>
    `

      header.forEach(hdr => {
        let blockStyle = 'td-block'
        let text = record[hdr.key]
        if (hdr.type === 'issueLink') {
          const atitle = author + ':' + title
          text = `<br><a title='${atitle}' href='${REDMINE_HOST}/redmine/issues/${record[hdr.key]}' target='_blank'>
          #${record['issueNum']} - ${atitle} &nbsp;<br></a><br>`
        }
        tdHtml += `
        <td style='text-align:center; word-wrap:break-all;'>
          <div class='${blockStyle}'>
            <div class='td-edit'>
              ${text}
            </div>
          </div>
        </td>
      `
      })
      table += `
      <tr>
        ${status}
        ${tdHtml}
      </tr>
    `
    })

  console.log(`records.length = ${records.length}`)
  if (records.length === 0) {
    table += `
      <td colspan='${aHeader.length}' style='text-align: center; word-break: break-all;'>
        <div class='td-block'>
          <div class='td-edit'>
            존재하지 않습니다
          </div>
        </div>
      </td>
    `
  }
  table += `
          </table>
        </div>
      </div>
    </div>
  `
  return content + table
}

function getStatus({total, open, inProgress, reopen, improvement, nonError}) {
  const undone = open + inProgress + reopen
  const done = total - undone
  const percent = `${((done / total) * 100).toFixed(1)} %`

  return `<h3>${MARK1} 요약 [${timestamp2()}]</h3><p class="subtitle"> 조치율 ${percent} [전체: ${total}, 조치: ${done}, 진행중: ${undone}] (개선사항: ${improvement}, 비결함: ${nonError} 포함)`
}

// module.exports =
function processRedstat(orgList) {
  const {scorecard, defectStatus, improvementStatus, defectList, improvementList, delayedList} = getSummary2(orgList)

  const bigRecords = getFilteredRecords(defectList, ['open', 'inProgress', 'inReview', 'underReview', 'reopen'])
  const smallRecords = getFilteredRecords(improvementList, ['open', 'inProgress', 'inReview', 'underReview', 'reopen'])
  const statusContent = getStatus(scorecard)

  const bigContents = getTable('big', defectStatus, bigRecords)
  const smallContents = getTable('small', improvementStatus, smallRecords)
  const contents = (bigRecords.length ? bigContents + smallContents : smallContents + bigContents) + getDelayTable(delayedList)

  // const templateContent = fs.readFileSync(`D:/mylab/http2/imported/xfer/template.html`)
  const templateContent = fs.readFileSync(`${__dirname}/template.html`)
  let html = templateContent.toString()

  html = html.replace('CONTENT_HERE', statusContent + contents)
  html = html.replace("'BIG_RECORDS'", JSON.stringify(bigRecords))
  html = html.replace("'SMALL_RECORDS'", JSON.stringify(smallRecords))

  return html
}

function load3() {
  http
    .get(`${REDMINE_HOST}/redmine/proc_status_viewer/t3.json?key=fvksds32nfdsjfksdjkfsdjfjfd`, response => {
      let data = ''

      response.on('data', chunk => {
        data += chunk
      })

      response.on('end', () => {
        const result = JSON.parse(data)
        console.log(result.proc_status.length)
        const html = processRedstat(result.proc_status)
        // console.log(html)
      })
    })
    .on('error', err => {
      console.log(`Error: ${err.message}`)
    })
}

function loadFake() {
  const loadJSON = file => {
    return new Promise((resolve, reject) => {
      fs.readFile(file, 'utf8', (err, content) => {
        if (err) {
          reject(err)
        } else {
          try {
            resolve(JSON.parse(content))
          } catch (err) {
            reject(err)
          }
        }
      })
    })
  }
  const file = __dirname + '/sample.json'
  loadJSON(file)
    .then(result => {
      // console.log(result)
      const html = processRedstat(result.proc_status)
      // console.log(html)
      const outfile = `${__dirname}/redmine_stat2.html`
      fs.writeFile(outfile, html, 'utf8', err => {
        if (err) {
          console.log(err)
        } else {
          console.log(`file ${outfile} was generated.`)
        }
      })
    })
    .catch(console.log)
}

loadFake()
