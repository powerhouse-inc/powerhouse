import { utils } from 'document-model/document';
import {
    ScopeFramework,
    SectionComponent,
} from '../..';

const buildExampleDocument = (): ScopeFramework => {
    const framework = new ScopeFramework();

    const scopeId = framework.state.global.elements[0].id;
    framework.updateElementName({ id: scopeId, name: 'The Governance Scope' });

    framework.updateElementComponents({
        id: scopeId,
        components: {
            content:
                'The Governance Scope covers principles and rules that regulate the critical balance of power, and adjudicate on appeals processes related to misalignment in the ecosystem. The Governance Scope must ensure that the resilient equilibrium of SkyDAO Governance remains protected against all potential direct and indirect threats.',
        },
    });

    framework.addElement({
        id: utils.hashKey(),
        path: 'A.1.1',
        type: 'Article',
        name: 'Scope Improvement',
        components: {
            content:
                "This Article discusses the principles and processes for improving the Governance Scope's Atlas Documents. It emphasizes the role of Scope Advisors, Governance Nebulae, and the Atlas Operational Platform. The Sections of this Article provide detailed insight into these roles and their responsibilities.",
        },
    });

    framework.addElement({
        id: utils.hashKey(),
        path: 'A.1.1.1',
        type: 'Section',
        name: 'Role of Scope Advisors',
        components: {
            content:
                'Improvements to the Governance Scope should be advised by expert Scope Advisors. They provide objective and factual input on Atlas Document improvements. They are selected through a governance poll, ensuring they meet specific criteria and avoid conflicts of interest. Their work output must be checked for alignment with the expected results.',
        },
    });

    framework.addElement({
        id: utils.hashKey(),
        path: 'A.1.1.2',
        type: 'Section',
        name: 'Role of Governance Nebulae',
        components: {
            content:
                'Governance Nebulae manage the Scope Advisors, from soliciting proposals to ensuring the produced work aligns with the Scope Artifact. They also have the authority to propose changes to the Scope Framework in response to ambiguous or challenging situations.',
        },
    });

    framework.addElement({
        id: utils.hashKey(),
        path: 'A.1.2',
        type: 'Article',
        name: 'Spirit of the Atlas',
        components: {
            content:
                'The Spirit of the Atlas represents the foundational principles of SkyDAO Governance, enshrined in the Immutable Documents and reflected in Atlas Documents and aligned participants of the Sky Ecosystem.',
        },
    });

    framework.addElement({
        id: utils.hashKey(),
        path: 'A.1.2.1',
        type: 'Section',
        name: 'Universal Alignment and the Spirit of the Atlas',
        components: {
            content:
                "The Spirit of the Atlas are the foundational principles that steer the SkyDAO Governance process. The Spirit of the Atlas are grounded concepts that enables coordination in the Sky Ecosystem around a resilient governance equilibrium that optimizes for Universal Alignment between the Sky Ecosystem and its surrounding environment.\nThe grounded concepts of the Spirit of the Atlas provide specific boundaries for distinguishing Universal Alignment and misalignment when operating in the Sky Ecosystem context.\nThe Immutable Documents of the Atlas are the bedrock for determining Universal Alignment of the Sky Ecosystem's rules and incentives, and hold precedence over any other conflicting rules or decisions. In situations where the Immutable Documents cannot be directly interpreted, the Spirit of the Atlas should be inferred in a way that maximizes Universal Alignment and mitigates risks of slippery slope misalignment. Achieving this necessitates a comprehensive understanding of Universal Alignment and the logic of how it is grounded in the Spirit of the Atlas within SkyDAO, and this Section must specify the processes to ensure the right research and documentation efforts occur to proactively protect the Spirit of the Atlas in the Sky Ecosystem.",
        },
    });

    framework.addElement({
        id: utils.hashKey(),
        path: 'A.1.2.2',
        type: 'Section',
        name: 'Interpretation of the Spirit of the Atlas',
        components: {
            content:
                'When the Immutable Documents do not contain explicit instructions about a particular topic, the Spirit of the Atlas should be extrapolated based on the best available knowledge and research into Universal Alignment. Resolution of Atlas Document ambiguity or contradictions must be fully congruent with the Spirit of the Atlas and prior precedent, and must be resolved in a way that also clearly sets new precedent to prevent future similar ambiguous situations from occurring.\nThis Section must cover the processes needed to operationalize the capability to research and describe the Spirit of the Atlas, the establishment of Spirit of the Atlas interpretations and precedent, and its application to Adaptive Documents. Nebulae must have a process for directly applying Spirit of the Atlas interpretations in cases of less ambiguity and impact. In situations where there are high levels of ambiguity about how to extraprolate the Spirit of the Atlas to the new data, a SkyDAO governance vote is needed to establish the precedent.',
        },
    });

    framework.addElement({
        id: utils.hashKey(),
        path: 'A.1.1.3',
        type: 'Section',
        name: 'Atlas Operational Platform',
        components: {
            content:
                'The Atlas Operational Platform is crucial for accessible participation in the Governance Scope. Part of the Scope Advisors must support its design and development. It should provide a comprehensive and user-friendly overview of all data and processes relevant to the Governance Scope, ensuring accessibility, transparency, and easy verification of processes and decisions.',
        },
    });

    return framework;
};

describe('ScopeFramework Class', () => {
    it('should create an empty document', () => {
        const framework = new ScopeFramework();

        expect(framework.name).toBe('');
        expect(framework.documentType).toBe('makerdao/scope-framework');
        expect(framework.getRevision("global")).toBe(0);

        expect(framework.state.global.rootPath).toBe('A');
        expect(framework.state.global.elements.length).toBe(1);
        expect(framework.state.global.elements[0].id).toMatch(
            /^[a-zA-Z0-9+\\/]{27}=$/,
        );
        expect(framework.state.global.elements[0].name).toBe('Scope Name');
        expect(framework.state.global.elements[0].path).toBe('A.1');
        expect(framework.state.global.elements[0].type).toBe('Scope');
        expect(framework.state.global.elements[0].version).toBe(1);
    });

    it('should apply main operations', () => {
        const framework = buildExampleDocument();

        framework.setRootPath({
            newRootPath: 'B',
        });

        expect(framework.state.global.rootPath).toBe('B');
        framework.state.global.elements.forEach(e => {
            expect(e.path.slice(0, 2)).toBe('B.');
        });

        framework.addElement({
            id: utils.hashKey(),
            type: 'Article',
            path: 'B.1.3',
            name: null,
            components: null,
        });

        expect(
            framework.state.global.elements.filter(e => e.path == 'B.1.3')
                .length,
        ).toBe(1);

        const elementId = framework.state.global.elements.filter(
            e => e.path == 'B.1.3',
        )[0].id;

        framework.updateElementType({
            id: elementId,
            type: 'Section',
        });

        framework.state.global.elements
            .filter(e => e.id == elementId)
            .forEach(e => {
                expect(e.type).toBe('Section');
            });

        framework.updateElementName({
            id: elementId,
            name: 'NEW NAME',
        });

        framework.state.global.elements
            .filter(e => e.id == elementId)
            .forEach(e => {
                expect(e.name).toBe('NEW NAME');
            });

        framework.updateElementComponents({
            id: elementId,
            components: {
                content: 'NEW CONTENT',
            },
        });

        framework.state.global.elements
            .filter(e => e.id == elementId)
            .forEach(e => {
                expect((e.components as SectionComponent).content).toBe(
                    'NEW CONTENT',
                );
            });

        const removeId = framework.state.global.elements.filter(
            e => e.path == 'B.1.2',
        )[0]?.id;
        framework.removeElement({ id: removeId });
        expect(
            framework.state.global.elements.filter(e =>
                e.path.startsWith('B.1.2'),
            ).length,
        ).toBe(0);
    });
});
