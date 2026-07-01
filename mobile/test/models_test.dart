import 'package:flutter_test/flutter_test.dart';
import 'package:shiftflow_mobile/models/models.dart';

void main() {
  test('AppUser.fromJson maps fields and manager flag', () {
    final owner = AppUser.fromJson({
      'id': 1, 'name': 'Анна', 'email': 'a@x', 'role': 'owner',
      'jobTitle': 'Управляющая', 'phone': '+7', 'organizationName': 'Org',
    });
    expect(owner.name, 'Анна');
    expect(owner.isManager, true);

    final emp = AppUser.fromJson({'id': 2, 'name': 'Иван', 'role': 'employee'});
    expect(emp.isManager, false);
    expect(emp.jobTitle, '');
  });

  test('Shift.fromJson parses timestamps and open shifts', () {
    final s = Shift.fromJson({
      'id': 10, 'title': 'Смена', 'user_name': null, 'job_title': null,
      'starts_at': '2026-07-01T08:00:00.000Z', 'ends_at': '2026-07-01T16:00:00.000Z',
      'status': 'open', 'location': 'Зал',
    });
    expect(s.id, 10);
    expect(s.userName, isNull);
    expect(s.status, 'open');
    expect(s.endsAt.isAfter(s.startsAt), true);
  });

  test('Conversation.fromJson reads unread and general flag', () {
    final c = Conversation.fromJson({
      'id': 1, 'type': 'group', 'isGeneral': true, 'title': 'Общий чат',
      'lastBody': 'Привет', 'lastAuthor': 'Анна',
      'lastAt': '2026-07-01 08:00:00', 'unread': 3,
    });
    expect(c.isGeneral, true);
    expect(c.unread, 3);
    expect(c.lastAt, isNotNull);
  });

  test('Message.fromJson parses author and body', () {
    final m = Message.fromJson({
      'id': 5, 'userId': 2, 'userName': 'Иван', 'body': 'Тест',
      'createdAt': '2026-07-01 08:05:00',
    });
    expect(m.userName, 'Иван');
    expect(m.body, 'Тест');
  });
}
