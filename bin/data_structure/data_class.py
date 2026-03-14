import json

class data_class:

    name = ""
    parent = ""
    value = ""
    dataType = ""
    description = ""
    tags = []

    def __init__(self, name, parent, value, dataType, description, tags):

        if name is not None:
            self.name = name
        if parent is not None:
            self.parent = parent
        if value is not None:
            self.value = value
        if dataType is not None:
            self.dataType = dataType
        if description is not None:
            self.description = description
        if tags is not None:
            self.tags = tags

    def __bytes__(self):
        return json.dumps({
            "name": self.name,
            "parent": self.parent,
            "value": self.value,
            "dataType": self.dataType,
            "description": self.description,
            "tags": self.tags
        }).encode("utf-8")

    def from_bytes(data: bytes):
        d = json.loads(data.decode("utf-8"))
        return data_class(d["name"], d["parent"], d["value"], d["dataType"], d["description"], d["tags"])


    def format_data(data: "data_class", graphSelection):

        if graphSelection == 0: #Bar Graph
            return data_class.format_bar_chart(data)
        
        elif graphSelection == 1: #Pie Chart
            return data_class.format_pie_chart(data)
        
        elif graphSelection == 2: #Tree Map
            return data_class.format_tree_map(data)
        
        elif graphSelection == 3: #Circle Packing
            return data_class.format_circle_packing(data)
        
        elif graphSelection == 4: #Sankey Diagram
            return data_class.format_sankey_diagram(data)

        return None
    
    
    def format_bar_chart(data: "data_class"):
        return data_class(data.name, None, data.value, None, None, None)

    def format_pie_chart(data: "data_class"):
        return data_class(data.name, None, data.value, None, None, None)

    def format_tree_map(data: "data_class"):
        return data_class(data.name, data.parent, data.value, None, None, None)

    def format_circle_packing(data: "data_class"):
        return data_class(data.name, data.parent, data.value, None, None, None)

    def format_sankey_diagram(data: "data_class"):
        return None