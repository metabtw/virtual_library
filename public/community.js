import { splitProfileCode } from './room-social.js';

export function studyInvitations(snapshot, t, escape, locale) {
  if (!snapshot.studyInvites?.length) return '';
  return `<section class="card community-card">
    <h2>${t('studyInvites')}</h2>
    ${snapshot.studyInvites.map(invite => `<div class="community-row"${invite.expiresAt ? ` data-invite-expires="${invite.expiresAt}"` : ''}>
      <div><strong>${escape(invite.name)}</strong><p>${escape(locale === 'en' ? invite.room_en : invite.room)}
        ${invite.private ? `<span class="private-badge">${t('privateBadge')}</span>` : ''}</p>
        ${invite.expiresAt ? `<small>${t('inviteExpires')} <b></b></small>` : ''}</div>
      <div class="community-actions">
        <button class="primary" data-action="answerStudyInvite" data-value="${escape(invite.id)}" data-answer="accept">${t('join')}</button>
        <button class="secondary" data-action="answerStudyInvite" data-value="${escape(invite.id)}" data-answer="reject">${t('reject')}</button>
      </div></div>`).join('')}
  </section>`;
}

export function studyInviteButton(friend, t, escape, label = t('studyInvite')) {
  if (friend.inRoom) return `<span class="friend-in-room">${escape(label)} · ${t('friendInRoom')}</span>`;
  return `<button class="secondary" data-action="inviteFriend" data-value="${escape(friend.id)}" data-invite-retry="${friend.inviteRetryAt ?? 0}">
    ${escape(label)}<small></small></button>`;
}

export function focusQuests(daily, weekly, t, expanded) {
  const dailyGoals = daily?.goals.map(goal => ({ ...goal, target: goal.minutes, progress: daily.minutes, unit: 'minutes' }));
  return [
    { goals: dailyGoals, title: 'dailyQuests', label: 'todayFocus' },
    { goals: weekly?.goals, title: 'weeklyQuests', label: 'weekFocus', reset: 'weeklyReset' },
  ].filter(group => group.goals?.length).map(({ goals, title, label, reset }) => `<details class="card community-card quest-panel" data-disclosure="${title}" ${expanded.has(title) ? 'open' : ''}>
    <summary class="disclosure-summary"><span>${t(title)}</span><small>${goals.filter(goal => goal.completed).length} / ${goals.length}</small></summary>
    ${reset ? `<p class="quest-reset">${t(reset)}</p>` : ''}
    <div class="quest-grid">${goals.map(goal => {
      const amount = Math.min(goal.progress, goal.target);
      const unit = t(goal.unit === 'days' ? 'dayUnit' : 'minuteUnit');
      const task = goal.id === 'streak-7' ? t('streakSeven') : `${t(goal.unit === 'days' ? 'activeDays' : label)} · ${goal.target} ${unit}`;
      return `<div class="quest">
        <div><strong>${task}</strong><span>+ ${goal.coins} ${t('coins')}</span></div>
        <progress aria-label="${task}" value="${amount}" max="${goal.target}"></progress>
        <small>${goal.completed ? '✓ ' + t('questCompleted') : `${amount} / ${goal.target} ${unit}`}</small>
      </div>`;
    }).join('')}</div>
  </details>`).join('');
}

export function friendsPanel(snapshot, friendCode, t, escape) {
  const { profile, friends = [] } = snapshot;
  if (!profile.readerCode) return '';
  return `<section class="card community-card">
    <h2>${t('friends')}</h2>
    ${profile.referralCode ? `<p>${t('referralInfo')}</p>` : ''}
    <form class="friend-form" id="friend-form">
      <label class="field">${t('friendId')} <span class="code-field"><span aria-hidden="true">SK-</span>
        <input name="friendCode" value="${escape(friendCode)}" required maxlength="15" autocapitalize="characters" autocomplete="off"></span></label>
      <button class="primary">${t('addFriend')}</button>
    </form>
    ${friends.length ? friends.map(friend => {
      const id = escape(friend.id);
      return `<div class="community-row"><div><strong>${escape(friend.name)}</strong><p>${escape(splitProfileCode(friend.shortCode || friend.code).suffix)}
        ${friend.status === 'sent' ? ' · ' + t('friendSent') : friend.status === 'incoming' ? ' · ' + t('friendIncoming') : ''}</p></div>
        <div class="community-actions">${friend.status === 'incoming'
          ? `<button class="primary" data-action="answerFriend" data-value="${id}" data-answer="accept">${t('friendAccept')}</button>
            <button class="secondary" data-action="answerFriend" data-value="${id}" data-answer="reject">${t('reject')}</button>`
          : `${friend.status === 'accepted' && profile.room
            ? friend.inRoom ? `<span class="friend-in-room">${t('friendInRoom')}</span>` : studyInviteButton(friend, t, escape) : ''}
            <button class="secondary" data-action="removeFriend" data-value="${id}">${t(friend.status === 'sent' ? 'friendCancel' : 'friendRemove')}</button>`}
        </div></div>`;
    }).join('') : `<p>${t('noFriends')}</p>`}
  </section>`;
}
