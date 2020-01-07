'use strict';

var _ = require('lodash');
/**
 * @class ExampleDataExtractor
 * @constructor
 */
var ExampleDataExtractor = function() {};

/**
 * Recursively build an object from a given schema component that is an example
 * representation of the object defined by the schema.
 *
 * @param {Object} component - valid subschema of the root/parent
 * @param {Object} root - parent schema used as the base
 * @param {Object} [options] - options for generating example representations of a schema
 * @returns {Object}
 */
ExampleDataExtractor.prototype.extract = function(component, root, options) {
  options = options || {};
  var reduced = {};

  if (!component) {
    throw new ReferenceError('No schema received to generate example data');
  }
  // If the schema defines an ID, change scope so all local references as resolved
  // relative to the schema with the closest ID
  if (component.id) {
    root = component;
  }

  if (component.type === 'array') {
     return [this.extract(component.items, root, options)]
  }

  if (component.allOf) {
    // Recursively extend/overwrite the reduced value.
    reduced = _.reduce(component.allOf, (accumulator, subschema) => {
      if (subschema.additionalProperties === false) {
          accumulator = this.extract(subschema, root, options);
          return accumulator
      }
      return _.extend(accumulator, this.extract(subschema, root, options));
    }, reduced);
  } else if (component.oneOf) {
    // Select the first item to build an example object from
    reduced = this.extract(component.oneOf[0], root, options);
  } else if (component.anyOf) {
    // Select the first item to build an example object from
    reduced = this.extract(component.anyOf[0], root, options);
  } else if (component.rel === 'self') {
    // Special case where the component is referencing the context schema.
    // Used in the Hyper-Schema spec
    reduced = this.extract(root, root, options);
  } else if (component.properties) {
    reduced = this.mapPropertiesToExamples(component.properties, root, options);
  } else {
    // Since it is nothing else assume it is a base property
    reduced = this.getExampleDataFromItem(component);
  }
  // Optionally merge in additional properties
  // @TODO: Determine if this is the right thing to do
  if (_.has(component, 'additionalProperties') && _.get(component, 'generator.includeAdditionalProperties')) {
    _.extend(reduced, this.mapPropertiesToExamples(component.additionalProperties, root, options));
  }

  if (_.isEmpty(reduced)) {
    reduced = this.mapPropertiesToExamples(component.properties, root, options);
  }

  if (component.exclusive) {
    for (var ii = 0; ii < component.exclusive.length; ii++) {
      for (var jj = 1; jj < component.exclusive[ii].length; jj++) {
          delete reduced[component.exclusive[ii][jj]]
      }
    }
  }

  return reduced;
};

/**
 * Maps a `properties` definition to an object containing example values
 *
 * `{attribute1: {type: 'string', example: 'example value'}}` ->
 * `{attribute1: 'example value'}`
 *
 * @param {Object} props - Properties definition object
 * @param {Object} schema - Root schema containing the properties
 * @param {Object} [options]
 * @returns {*}
 */
ExampleDataExtractor.prototype.mapPropertiesToExamples = function(props, schema, options) {
  options = options || {};

  return _.transform(props, (properties, propConfig, propName) => {
    // Allow opt-ing out of generating example data
    if (_.startsWith(propName, '__') || propConfig.private) {
      return properties;
    }

    var example = this.getExampleDataFromItem(propConfig);

    if (propConfig.rel === 'self') {
      example = this.extract(schema, schema);
    } else if (propConfig.type === 'array' && propConfig.items && !example) {
      if (propConfig.items.example) {
        example = [propConfig.items.example];
      } else {
        example = [this.extract(propConfig.items, schema)];
      }
    } else if (propConfig.id && !example) {
      example = this.extract(propConfig, propConfig);
    } else if (propConfig.properties) {
      example = this.mapPropertiesToExamples(propConfig.properties, schema);
    } else if (propConfig.oneOf || propConfig.anyOf) {
      example = this.extract(propConfig, schema);
    } else if (propConfig.allOf) {
      example = _.reduce(propConfig.allOf, (accumulator, item) => {
        return _.extend(accumulator, this.extract(item, schema));
      }, example || {});
    }

    if (propConfig.exclusive) {
      for (var ii = 0; ii < propConfig.exclusive.length; ii++) {
        for (var jj = 1; jj < propConfig.exclusive[ii].length; jj++) {
          delete example[propConfig.exclusive[ii][jj]]
        }
      }
    }

    // Special case for ID. This is done mostly because
    // the parser gets confused when declaring "id" as a property of an object,
    // because it wants to resolve it as reference to another schema.
    // The current solution is to declare ids as "ID" for the data object in the schema
    // See: http://json-schema.org/latest/json-schema-core.html#anchor27
    // Override with `preserveCase` in the options
    properties[propName === 'ID' ? propName.toLowerCase() : propName] = example;
  }, {});
};

/**
 * @param {Object} reference
 * @returns {String}
 */
ExampleDataExtractor.prototype.getExampleDataFromItem = function(reference) {
  if (!_.isPlainObject(reference)) {
    return 'unknown';
  }
  return _.has(reference, 'example') ? reference.example : reference.default;
};

/**
 * @module lib/example-data-extractor
 * @type {ExampleDataExtractor}
 */
module.exports = new ExampleDataExtractor();
