const {Builder, By, Key, until} = require('selenium-webdriver')

;(async function example() {
  let driver = await new Builder().forBrowser('chrome').build()
  try {
    await driver.get('https://www.chinyangvalley.co.kr/member/login.asp')
    const userAgent = await driver.executeScript('return navigator.userAgent')
    console.log({userAgent})
    const idInput = await driver.findElement(By.id('txtId'))
    idInput.sendKeys('abcde')
    const pwInput = await driver.findElement(By.id('txtPw'))
    pwInput.sendKeys('abcde')
    // const button = await driver.findElement(By.className('login'))
    const button = await driver.findElement(By.xpath('//*[@id="wrap"]/div/div[2]/div[2]/ul[1]/li[3]'))
    console.log({button})
    button.click()
    const byList = By.className('gnbList')
    await driver.wait(until.elementLocated(byList), 10000)
    driver.sleep(3 * 1000)
    const byEl = await driver.findElement(byList)
    console.log({byList, byEl})
    await driver.wait(until.elementIsVisible(byEl), 10000)
    const gnbList = await driver.findElement(By.className('gnbList'))
    await driver.actions().move({origin: gnbList}).perform()
    const bookings = await driver.findElements(By.xpath('//*[@id="scrollmenu"]/div/div/div[2]/ul/li/a'))
    console.log({bookings})
    for (b of bookings) {
      console.log(' - ' + (await b.getText()))
    }
    // booking.click()
    // console.log({booking})

    // button.submit()
    // button.sendKeys(Key.ENTER)
    // await driver.wait(until.elementLocated(By.css('#header_wrap')), 10000)
    // const results = await driver.findElements(By.className('total_tit'))
    // console.log(`+ total ${results.length} found`)
    // // results.forEach(item => {
    // //   console.log('  - ' + (await item.getText()))
    // // })
    // for (let i = 0; i < results.length; i++) {
    //   console.log(' - ' + (await results[i].getText()))
    // }

    // if (results.length > 0) {
    //   await results[0].click()
    // }

    // await driver.wait(() => false, 5000)
  } catch (error) {
    console.log(error)
  } finally {
    // driver.quit()
  }
})()

