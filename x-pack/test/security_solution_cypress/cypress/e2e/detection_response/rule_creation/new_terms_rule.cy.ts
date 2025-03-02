/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { formatMitreAttackDescription, getHumanizedDuration } from '../../../helpers/rules';
import { getIndexPatterns, getNewTermsRule } from '../../../objects/rule';

import { ALERT_DATA_GRID } from '../../../screens/alerts';
import {
  CUSTOM_RULES_BTN,
  RISK_SCORE,
  RULES_MANAGEMENT_TABLE,
  RULE_NAME,
  RULE_SWITCH,
  SEVERITY,
} from '../../../screens/alerts_detection_rules';
import {
  ABOUT_DETAILS,
  ABOUT_INVESTIGATION_NOTES,
  ABOUT_RULE_DESCRIPTION,
  ADDITIONAL_LOOK_BACK_DETAILS,
  CUSTOM_QUERY_DETAILS,
  DEFINITION_DETAILS,
  FALSE_POSITIVES_DETAILS,
  removeExternalLinkText,
  INDEX_PATTERNS_DETAILS,
  INVESTIGATION_NOTES_MARKDOWN,
  INVESTIGATION_NOTES_TOGGLE,
  MITRE_ATTACK_DETAILS,
  REFERENCE_URLS_DETAILS,
  RISK_SCORE_DETAILS,
  RULE_NAME_HEADER,
  RULE_TYPE_DETAILS,
  RUNS_EVERY_DETAILS,
  SCHEDULE_DETAILS,
  SEVERITY_DETAILS,
  TAGS_DETAILS,
  TIMELINE_TEMPLATE_DETAILS,
  NEW_TERMS_HISTORY_WINDOW_DETAILS,
  NEW_TERMS_FIELDS_DETAILS,
} from '../../../screens/rule_details';

import { getDetails, waitForTheRuleToBeExecuted } from '../../../tasks/rule_details';
import { expectNumberOfRules, goToRuleDetailsOf } from '../../../tasks/alerts_detection_rules';
import { cleanKibana, deleteAlertsAndRules } from '../../../tasks/common';
import {
  createAndEnableRule,
  fillAboutRuleAndContinue,
  fillDefineNewTermsRuleAndContinue,
  fillScheduleRuleAndContinue,
  selectNewTermsRuleType,
  waitForAlertsToPopulate,
} from '../../../tasks/create_new_rule';
import { login } from '../../../tasks/login';
import { visit } from '../../../tasks/navigation';
import { CREATE_RULE_URL } from '../../../urls/navigation';
import { openRuleManagementPageViaBreadcrumbs } from '../../../tasks/rules_management';

// TODO: https://github.com/elastic/kibana/issues/161539
describe('New Terms rules', { tags: ['@ess', '@serverless', '@brokenInServerless'] }, () => {
  before(() => {
    cleanKibana();
    login();
  });
  describe('Detection rules, New Terms', () => {
    const rule = getNewTermsRule();
    const expectedUrls = rule.references?.join('');
    const expectedFalsePositives = rule.false_positives?.join('');
    const expectedTags = rule.tags?.join('');
    const mitreAttack = rule.threat;
    const expectedMitre = formatMitreAttackDescription(mitreAttack ?? []);
    const expectedNumberOfRules = 1;

    beforeEach(() => {
      deleteAlertsAndRules();
      login();
    });

    it('Creates and enables a new terms rule', function () {
      visit(CREATE_RULE_URL);
      selectNewTermsRuleType();
      fillDefineNewTermsRuleAndContinue(rule);
      fillAboutRuleAndContinue(rule);
      fillScheduleRuleAndContinue(rule);
      createAndEnableRule();
      openRuleManagementPageViaBreadcrumbs();

      cy.get(CUSTOM_RULES_BTN).should('have.text', 'Custom rules (1)');

      expectNumberOfRules(RULES_MANAGEMENT_TABLE, expectedNumberOfRules);

      cy.get(RULE_NAME).should('have.text', rule.name);
      cy.get(RISK_SCORE).should('have.text', rule.risk_score);
      cy.get(SEVERITY).should('have.text', 'High');
      cy.get(RULE_SWITCH).should('have.attr', 'aria-checked', 'true');

      goToRuleDetailsOf(rule.name);

      cy.get(RULE_NAME_HEADER).should('contain', `${rule.name}`);
      cy.get(ABOUT_RULE_DESCRIPTION).should('have.text', rule.description);
      cy.get(ABOUT_DETAILS).within(() => {
        getDetails(SEVERITY_DETAILS).should('have.text', 'High');
        getDetails(RISK_SCORE_DETAILS).should('have.text', rule.risk_score);
        getDetails(REFERENCE_URLS_DETAILS).should((details) => {
          expect(removeExternalLinkText(details.text())).equal(expectedUrls);
        });
        getDetails(FALSE_POSITIVES_DETAILS).should('have.text', expectedFalsePositives);
        getDetails(MITRE_ATTACK_DETAILS).should((mitre) => {
          expect(removeExternalLinkText(mitre.text())).equal(expectedMitre);
        });
        getDetails(TAGS_DETAILS).should('have.text', expectedTags);
      });
      cy.get(INVESTIGATION_NOTES_TOGGLE).click();
      cy.get(ABOUT_INVESTIGATION_NOTES).should('have.text', INVESTIGATION_NOTES_MARKDOWN);
      cy.get(DEFINITION_DETAILS).within(() => {
        getDetails(INDEX_PATTERNS_DETAILS).should('have.text', getIndexPatterns().join(''));
        getDetails(CUSTOM_QUERY_DETAILS).should('have.text', rule.query);
        getDetails(RULE_TYPE_DETAILS).should('have.text', 'New Terms');
        getDetails(TIMELINE_TEMPLATE_DETAILS).should('have.text', 'None');
        getDetails(NEW_TERMS_FIELDS_DETAILS).should('have.text', 'host.name');
        getDetails(NEW_TERMS_HISTORY_WINDOW_DETAILS).should('have.text', '51000h');
      });
      cy.get(SCHEDULE_DETAILS).within(() => {
        getDetails(RUNS_EVERY_DETAILS).should('have.text', `${rule.interval}`);
        const humanizedDuration = getHumanizedDuration(
          rule.from ?? 'now-6m',
          rule.interval ?? '5m'
        );
        getDetails(ADDITIONAL_LOOK_BACK_DETAILS).should('have.text', `${humanizedDuration}`);
      });

      waitForTheRuleToBeExecuted();
      waitForAlertsToPopulate();

      cy.get(ALERT_DATA_GRID)
        .invoke('text')
        .then((text) => {
          expect(text).contains(rule.name);
          expect(text).contains(rule.severity);
          expect(text).contains(rule.risk_score);
        });
    });
  });
});
