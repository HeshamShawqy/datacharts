from enum import Enum

class GraphName(Enum):
    BAR_GRAPH = "Bar Graph"
    PIE_CHART = "Pie Chart"
    TREE_MAP = "Tree Map"
    CIRCLE_PACKING = "Circle Packing"
    SANKEY_DIAGRAM = "Sankey Diagram"

class graph_class:

    graph = None

    def __init__(self, selection):

        if selection is not None:
            self.GraphName = str(list(GraphName)[selection])