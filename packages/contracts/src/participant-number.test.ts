import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARTICIPANT_NO_FORMAT,
  formatParticipantNo,
  participantFormatError,
  renderParticipantNo,
} from './index';

const p = { typeShort: 'asts', academicYearStart: '2026-07-13', className: 'XII IPA/1', seq: 7 };

describe('nomor peserta: format', () => {
  it('format bawaan sama dengan formatParticipantNo lama', () => {
    expect(renderParticipantNo(DEFAULT_PARTICIPANT_NO_FORMAT, p)).toBe('ASTS-26-007');
    expect(renderParticipantNo(DEFAULT_PARTICIPANT_NO_FORMAT, p)).toBe(
      formatParticipantNo('asts', '2026-07-13', 7),
    );
  });

  it('semua token', () => {
    expect(renderParticipantNo('{yyyy}/{jenis}/{kelas}/{urut}', p)).toBe('2026/ASTS/XII-IPA1/7');
    expect(renderParticipantNo('{urut:5}', { ...p, seq: 123456 })).toBe('123456');
    expect(renderParticipantNo('{urut:2}{urut:4}', p)).toBe('070007');
    expect(renderParticipantNo('{jenis}{yy}', { ...p, typeShort: '', academicYearStart: 'x' })).toBe('UJN00');
  });

  it('validasi', () => {
    expect(participantFormatError('{jenis}-{yy}-{urut:3}')).toBeNull();
    expect(participantFormatError('{urut}')).toBeNull();
    expect(participantFormatError('')).not.toBeNull();
    expect(participantFormatError('ABC')).toContain('{urut}');
    expect(participantFormatError('{foo}{urut}')).toContain('{foo}');
    expect(participantFormatError('{urut:0}')).not.toBeNull();
    expect(participantFormatError('{urut:10}')).not.toBeNull();
    expect(participantFormatError('{urut} {')).not.toBeNull();
    expect(participantFormatError('}{urut}')).not.toBeNull();
    expect(participantFormatError('{urut}\n')).toContain('kontrol');
    expect(participantFormatError('{urut}'.padEnd(41, 'x'))).toContain('40');
    expect(participantFormatError('x'.repeat(34) + '{urut}')).toBeNull();
  });
});
