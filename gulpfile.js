var typescript = require('gulp-tsc');
var gulp = require('gulp');

gulp.task('default', function() {
  // place code for your default task here
});

gulp.task('compile', function () {
    gulp.src(['typescript/utils.ts'])
        .pipe(typescript({
            module: "amd"
        }))
        .pipe(gulp.dest('static/js/lush/'));
});
