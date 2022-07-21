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

function timestamp2() {
  const today = new Date()
  today.setHours(today.getHours() + 9)
  return today.toISOString().replace('T', ' ').substring(5,16)
}

function getFilteredCount(tuple, filter) {
  return filter.map(f => tuple[f].length).reduce((acc, cur) => (acc + cur), 0)
}

function getFilteredRecords(tuples, filter) {
  return tuples.filter(tuple => getFilteredCount(tuple, filter))
}

function load3() {
  http
    .get('http://10.2.55.67/redmine/proc_status_viewer/t3.json?key=fvksds32nfdsjfksdjkfsdjfjfd', response => {
      let data = ''

      response.on('data', chunk => {
        data += chunk
      })

      response.on('end', () => {
        const result = JSON.parse(data)
        console.log(result.proc_status.length)
        process(result.proc_status)
      })
    })
    .on('error', err => {
      console.log(`Error: ${err.message}`)
    })
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

  return {
    dayStr: rtfStr.format(-1 * days, 'day'),
    dayNum: rtfNum.format(-1 * days, 'day').find(x => x.type === 'integer').value,
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
  Object.keys(status).map(k => (arrayStatus[k]) = []))
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

  list.map(item => {
    const status = item['current_status']
    const issueNum = item['issue_number']
    const issueKind = item['issue_kind']
    const author = item['author']
    const subject = decodeURI(item['subject'])
    let name = 'nobody'

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
        const {dayStr, dayNum} = calculateBizDays(regiDay, new Date())
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
    const {improvement, nonError, ...subStatus} = redStatus
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
      })
    } else {
      console.log(`+ Warning: unknown status(${status})`)
    }
    currentList = currentList.map(a => a.name === assignee.name ? assignee : a)
  })
  defectList = defectList.sort((a,b) => (b.open.length + b.inProgress.length + b.reopen) - (a.open.length + a.inProgress.length + a.reopen))
  improvementList = improvementList.sort((a,b) => (b.open.length + b.inProgress.length + b.reopen) - (a.open.length + a.inProgress.length + a.reopen))

  function getStatus(list) {
    let total = 0;
    let status = {}
    Object.keys(redStatus).map(key => {
      status[key] = list.map(x => x[key].length).reduce((acc,cur) => (acc+cur), 0)
      total += status[key]
    })
    return {
      total,
      ...status
    }
  }
  const defectStatus = getStatus(defectList)
  const improvementStatus = getStatus(improvementStatus)

  return {
    scorecard,
    defectList,
    improvementList,
    defectStatus : getStatus(defectList),
    improvementStatus: getStatus(improvementStatus),
    delayedList,
  }
}

function getSubHeader(prefix, status) {
  const undone = status.open + status.inProgress + status.reopen
  const done = status.total - undone
  const percent = `${((done / status.total) * 100).toFixed(0)}`
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
    <p class="subtitle">조치율 ${percent}% [전체: ${status.totla}, 진행중: ${undone}] </p>
    <span style="color: red; font-size: 14px; font-weight: bold;"> &nbsp; ${MARK_CHECK} &nbsp; 파란색 원 클릭시 해당 결함맘ㄴ 결함링크에 표시 </span>
  `
}

function getTable(prefix, status, records) {
  const header = [
    {key: 'name', title: 'Name', width: "10%"},
    {key: 'open', title: '신규', width: "10%"},
    {key: 'inProgress', title: '조치중', width: "10%"},
    {key: 'reopen', title: '재결함', width: "10%"},
    {key: 'inReview', title: '조치완료', width: "10%"},
    {key: 'underReview', title: '검토완료', width: "10%"},
    {key: 'approved', title: '확인완료', width: "10%"},
    {key: 'issues', title: '결함링크', width: "10%"},
  ]
  const subHeader = getSubHeader(prefix, status)

  let table = `
    <div class="onepiece">
      <div class="trow">
        <div class="tcards">
          <table class="guide_table">
  `
  let thHtml = ""
  let cols = ""

  header.forEach(hdr => {
    cols += ` <col span="1" width="${hdr.width}" style="background-color: #FF9C4;"> `
    thHtml += `<th style="text-align: center;">${hdr.title}</th>`
  })
  table += `<colgroup>${cols}</colgroup> <tr>${thHtml}</tr>`

  records.map((record, idx) => {
    let tdHtml = ""
    header.map((hdr, jdx) => {
      const key = hdr.key
      const valId = `${prefix}_${idx}_${key}`
      let copyButton = ""
      let blockStyle = "td-block"
      const needLink = Array.isArray(record[key]) && record[key].length && key !== 'approved'
      let text = redStatus.hasOwnProperty(key) ? record[key].length : record[key]
      const targetId = `${prefix}_$${idx}_issues`
      const showTag = needLink ? `<button class="issue2-button" onclick="showIssue('${prefix}', '${targetId}', ${idx}, '${key}' )"> ${text} </button>` : ""
      tdHtml += `
        <td style="text-align: center; word-break: break-all;">
          <div class="${blockStyle}">
            <div class="td-edit" id="${valId}">
              ${needLink ? showTag : text}
            </div>
          </div>
        </td>
      `
    })
    table += ` <tr> ${tdHtml} </tr> `
  })

  if (records.length === 0) {
    table += `
      <td colspan="${header.length}" style="text-align: center; word-break: break-all;">
        <div class="td-block">
          <div lass="td-edit">
            존재하지 않습니다.
          </div>
        </div>
      </td>
    `
  }
  table += `</table>
          </div>
        </div>
      </div> <br>
  `
  return content + table
}

function getDelayTable(records) {

}

function getStatus({total, open, inProgress, reopen, improvements, noissue, }) {
  const undone = open + inProgress + reopen
  const done = total - undone
  const percent = `${((done/total)*100).toFixed(1)} %`

  return `<h3>${MARK1} 요약 [${timestamp2()}]</h3><p class="subtitle"> 조치율 ${percent} [전체: ${total}, 조치: ${done}, 진행중: ${undone}] (개선사항: ${improvements}, 비결함: ${noissue} 포함)`
}

module.exports = function processRedstat(orgList) {
  const {status, defectStatus, improveStatus, records, records2, delayedList} = getSummary2(orgList)

  const bigRecords = getFilteredRecords(records, ['open','inProgress','inReview', 'underReview','reopen'])
  const smallRecords = getFilteredRecords(records2, ['open','inProgress','inReview', 'underReview','reopen'])
  const statusContent = getStatus(status)

  const bigContents = getTable('big', defectStatus, bigRecords)
  const smallContents = getTable('small', improveStatus, smallRecors)
  const contents = (bigRecords.length ? bigContents + smallContents : smallContents + bigContents) + getDelayTable(delay)
}
