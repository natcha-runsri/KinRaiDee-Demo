// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      jasmine: {
        // you can add configuration options for Jasmine here
        // the possible options are listed at https://jasmine.github.io/api/edge/Configuration.html
        // for example, you can disable the random execution with `random: false`
        // or set a specific seed with `seed: 4321`
      },
    },
    jasmineHtmlReporter: {
      suppressAll: true // removes the duplicated traces
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/frontend'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' }
      ],
      // quality gate ของ CI (ng test --code-coverage): ต่ำกว่านี้ = fail
      // ค่าจริง 2026-10-23: statements 18.3%, branches 3.97%, functions 10.47%, lines 20.12% (spec มีแค่ระดับ "สร้างได้";
      // frontend ทดสอบหลักด้วย Playwright e2e) — เพิ่ม spec แล้วค่อยขยับขึ้น
      check: {
        global: { statements: 17, branches: 3, functions: 9, lines: 19 }
      }
    },
    reporters: ['progress', 'kjhtml'],
    browsers: ['Chrome'],
    // CI (GitHub Actions) รันเป็น root ใน container ไม่ได้ใช้ sandbox ของ Chrome
    customLaunchers: {
      ChromeHeadlessCI: { base: 'ChromeHeadless', flags: ['--no-sandbox'] }
    },
    restartOnFileChange: true
  });
};
