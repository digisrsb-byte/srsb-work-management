# What's New in v1.2.7

## Employee Break Management
- Punch In and Punch Out remain in My Attendance.
- Employees can Start Break and End Break from the application.
- Break types: Lunch, Tea, Personal and Other.
- First 30 minutes of Lunch per employee per day are included.
- Lunch above 30 minutes is deducted.
- Tea, Personal and Other breaks are fully deducted.
- Employees see Effective Work, Total Break, Included Lunch, Deducted Break and Today's Break History.
- Punch Out is blocked until an active break is ended.

## Final Attendance
Calculated from effective working time:
- 8h 50m or more = Present
- 3h 00m through 8h 49m = Half Day
- Below 3h = Absent

## Admin Attendance
- Total Break Time
- Deducted Break
- Effective Working Hours
- Current On Break indicator
- Break History for each employee/date

## Audit
A new attendance_breaks table stores:
- employee
- attendance/date
- break type
- start
- end
- duration
- source
