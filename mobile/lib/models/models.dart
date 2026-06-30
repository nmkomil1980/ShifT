class AppUser {
  final int id;
  final String name;
  final String email;
  final String role;
  final String jobTitle;
  final String phone;
  final String organizationName;

  AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.jobTitle,
    required this.phone,
    required this.organizationName,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'] as int,
        name: j['name'] ?? '',
        email: j['email'] ?? '',
        role: j['role'] ?? 'employee',
        jobTitle: j['jobTitle'] ?? '',
        phone: j['phone'] ?? '',
        organizationName: j['organizationName'] ?? '',
      );

  bool get isManager => role == 'owner' || role == 'manager';
}

class Shift {
  final int id;
  final String title;
  final String? userName;
  final String? jobTitle;
  final DateTime startsAt;
  final DateTime endsAt;
  final String status;
  final String location;

  Shift({
    required this.id,
    required this.title,
    required this.userName,
    required this.jobTitle,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    required this.location,
  });

  factory Shift.fromJson(Map<String, dynamic> j) => Shift(
        id: j['id'] as int,
        title: j['title'] ?? '',
        userName: j['user_name'],
        jobTitle: j['job_title'],
        startsAt: DateTime.parse(j['starts_at']).toLocal(),
        endsAt: DateTime.parse(j['ends_at']).toLocal(),
        status: j['status'] ?? 'scheduled',
        location: j['location'] ?? '',
      );
}

class StaffMember {
  final int id;
  final String name;
  final String jobTitle;
  final String role;
  final String status;

  StaffMember({
    required this.id,
    required this.name,
    required this.jobTitle,
    required this.role,
    required this.status,
  });

  factory StaffMember.fromJson(Map<String, dynamic> j) => StaffMember(
        id: j['id'] as int,
        name: j['name'] ?? '',
        jobTitle: j['jobTitle'] ?? '',
        role: j['role'] ?? 'employee',
        status: j['status'] ?? 'active',
      );
}

class LeaveRequest {
  final int id;
  final String type;
  final String status;
  final DateTime startsAt;
  final DateTime endsAt;
  final String reason;
  final String? userName;

  LeaveRequest({
    required this.id,
    required this.type,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    required this.reason,
    required this.userName,
  });

  factory LeaveRequest.fromJson(Map<String, dynamic> j) => LeaveRequest(
        id: j['id'] as int,
        type: j['type'] ?? 'time_off',
        status: j['status'] ?? 'pending',
        startsAt: DateTime.parse(j['starts_at']).toLocal(),
        endsAt: DateTime.parse(j['ends_at']).toLocal(),
        reason: j['reason'] ?? '',
        userName: j['user_name'],
      );
}
